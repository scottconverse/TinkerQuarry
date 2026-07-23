import {
  decompressSource,
  deleteShare,
  extractPrimaryCode,
  getBearerToken,
  getThumbnailUrl,
  hashToken,
  json,
  parseProjectSharePayload,
  readShare,
  shareDecompressionCap,
  timingSafeEqual,
  type Env,
} from "../../_lib/share";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const shareId = context.params.id;
  if (!shareId || typeof shareId !== "string") {
    return json({ error: "Missing share id." }, { status: 400 });
  }

  const share = await readShare(context.env, shareId);
  if (!share) {
    return json({ error: "Design not found" }, { status: 404 });
  }

  let decompressed: string;
  try {
    decompressed = await decompressSource(
      share.code,
      shareDecompressionCap(share),
    );
  } catch {
    return json({ error: "Design payload is invalid." }, { status: 422 });
  }
  const thumbnailUrl = share.thumbnailKey
    ? getThumbnailUrl(new URL(context.request.url).origin, share.id)
    : null;

  if (share.format === "project") {
    let payload;
    try {
      payload = parseProjectSharePayload(decompressed);
    } catch {
      return json({ error: "Design payload is invalid." }, { status: 422 });
    }
    return json({
      id: share.id,
      code: payload.files[payload.renderTarget] ?? "",
      files: payload.files,
      renderTarget: payload.renderTarget,
      title: share.title,
      createdAt: share.createdAt,
      forkedFrom: share.forkedFrom,
      thumbnailUrl,
    });
  }

  return json({
    id: share.id,
    code: decompressed,
    title: share.title,
    createdAt: share.createdAt,
    forkedFrom: share.forkedFrom,
    thumbnailUrl,
  });
};

/**
 * WEB-5: retract a share. Authenticated with the single-use delete token minted
 * at create time — the same proven pattern as the thumbnail upload token. Before
 * this there was no delete path anywhere in the codebase, so an uploaded design
 * could never be taken back.
 */
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const shareId = context.params.id;
  if (!shareId || typeof shareId !== "string") {
    return json({ error: "Missing share id." }, { status: 400 });
  }

  const share = await readShare(context.env, shareId);
  if (!share) {
    return json({ error: "Design not found" }, { status: 404 });
  }

  const token = getBearerToken(context.request);
  if (!token || !share.deleteTokenHash) {
    return json({ error: "Missing or invalid delete token." }, { status: 401 });
  }

  const providedHash = await hashToken(token);
  if (!timingSafeEqual(providedHash, share.deleteTokenHash)) {
    return json({ error: "Missing or invalid delete token." }, { status: 401 });
  }

  await deleteShare(context.env, share);
  return json({ id: share.id, deleted: true });
};
