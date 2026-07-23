import {
  compressSource,
  enforceShareRateLimit,
  getShareUrl,
  hashToken,
  json,
  MAX_CODE_BYTES,
  MAX_PAYLOAD_BYTES,
  MAX_PROJECT_FILES,
  randomShareId,
  randomToken,
  readShare,
  sanitizeTitle,
  SHARE_TTL_SECONDS,
  type Env,
  type ProjectSharePayload,
  type ShareRecord,
  validateForkedFrom,
  writeShare,
} from "../_lib/share";
import {
  isOpenScadProjectFilePath,
  isRenderableOpenScadFilePath,
} from "../../../../packages/shared/src/openscadProjectFiles";

type CreateShareBody = {
  code?: unknown;
  files?: unknown;
  renderTarget?: unknown;
  title?: unknown;
  forkedFrom?: unknown;
};

const PROJECT_PATH_RE = /^(?!.*\.\.)(?!\/)[a-zA-Z0-9_\-./]+$/;

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).every(
    ([, v]) => typeof v === "string",
  );
}

function validateProjectFiles(
  files: Record<string, string>,
  renderTarget: string,
): string | null {
  const paths = Object.keys(files);
  if (paths.length === 0) {
    return "Project must contain at least one file.";
  }
  if (paths.length > MAX_PROJECT_FILES) {
    return `Too many files (${MAX_PROJECT_FILES} max).`;
  }
  for (const path of paths) {
    if (!PROJECT_PATH_RE.test(path) || !isOpenScadProjectFilePath(path)) {
      return `Invalid file path: ${path}`;
    }
  }
  if (!(renderTarget in files)) {
    return "renderTarget must be a file in the project.";
  }
  if (!isRenderableOpenScadFilePath(renderTarget)) {
    return "renderTarget must be a renderable .scad file in the project.";
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return json({ error: "Expected application/json." }, { status: 400 });
  }

  // WEB-3: parse and validate BEFORE charging the limiter. An unhandled
  // SyntaxError here used to surface as a worker exception (not the documented
  // JSON error shape) *after* the caller's quota had already been consumed.
  let body: CreateShareBody;
  try {
    body = (await request.json()) as CreateShareBody;
  } catch {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = sanitizeTitle(body.title);
  const forkedFrom = validateForkedFrom(body.forkedFrom);

  const encoder = new TextEncoder();
  let storedPayload: string;
  let codeSize: number;
  let payloadSize: number;
  let format: ShareRecord["format"];

  // Multi-file project share
  if (body.files !== undefined) {
    if (!isStringRecord(body.files)) {
      return json({ error: "Invalid files format." }, { status: 400 });
    }
    if (
      typeof body.renderTarget !== "string" ||
      body.renderTarget.length === 0
    ) {
      return json(
        { error: "Missing or invalid renderTarget." },
        { status: 400 },
      );
    }

    const files = body.files as Record<string, string>;
    const renderTarget = body.renderTarget as string;

    const validationError = validateProjectFiles(files, renderTarget);
    if (validationError) {
      return json({ error: validationError }, { status: 400 });
    }

    codeSize = Object.values(files).reduce(
      (sum, content) => sum + encoder.encode(content).length,
      0,
    );
    if (codeSize > MAX_CODE_BYTES) {
      return json(
        { error: "Project is too large (50KB max across all files)." },
        { status: 413 },
      );
    }

    const payload: ProjectSharePayload = { files, renderTarget };
    const serialized = JSON.stringify(payload);
    // WEB-1: the blob we store is the JSON envelope, not the bare file contents,
    // so the read-side decompression cap must be the envelope's byte length.
    payloadSize = encoder.encode(serialized).length;
    if (payloadSize > MAX_PAYLOAD_BYTES) {
      return json(
        { error: "Project is too large (50KB max across all files)." },
        { status: 413 },
      );
    }
    storedPayload = serialized;
    format = "project";
  }
  // Single-file share (existing behavior)
  else {
    if (typeof body.code !== "string" || body.code.length === 0) {
      return json({ error: "Missing or invalid code." }, { status: 400 });
    }

    codeSize = encoder.encode(body.code).length;
    if (codeSize > MAX_CODE_BYTES) {
      return json(
        { error: "Design is too large (50KB max)." },
        { status: 413 },
      );
    }

    payloadSize = codeSize;
    storedPayload = body.code;
    format = undefined;
  }

  // WEB-3: the quota is charged only once the request is known to be storable,
  // so a 400/413 never burns a caller's budget.
  const rateLimitResponse = await enforceShareRateLimit(request, env);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const compressedCode = await compressSource(storedPayload);
  const thumbnailUploadToken = randomToken();
  const thumbnailUploadTokenHash = await hashToken(thumbnailUploadToken);
  // WEB-5: hand the creator a token that can retract the share later.
  const deleteToken = randomToken();
  const deleteTokenHash = await hashToken(deleteToken);

  let shareId = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = randomShareId();
    const existing = await readShare(env, candidate);
    if (!existing) {
      shareId = candidate;
      break;
    }
  }

  if (!shareId) {
    return json(
      { error: "Unable to create a unique share link right now." },
      { status: 500 },
    );
  }

  const record: ShareRecord = {
    id: shareId,
    code: compressedCode,
    title,
    createdAt: new Date().toISOString(),
    forkedFrom,
    thumbnailKey: null,
    thumbnailUploadTokenHash,
    deleteTokenHash,
    codeSize,
    payloadSize,
  };
  if (format) {
    record.format = format;
  }

  await writeShare(env, record);

  return json({
    id: shareId,
    url: getShareUrl(new URL(request.url).origin, shareId),
    thumbnailUploadToken,
    deleteToken,
    expiresInSeconds: SHARE_TTL_SECONDS,
  });
};
