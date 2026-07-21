import { onRequestPost } from "../share";
import { onRequestDelete, onRequestGet } from "../share/[id]";
import {
  compressSource,
  decompressSource,
  hashToken,
  SHARE_TTL_SECONDS,
} from "../../_lib/share";
import { createMockEnv, createPagesContext } from "../../__tests__/test-utils";

/**
 * The decompression cap the READ path actually applies to a stored record.
 * Mirrors functions/api/share/[id].ts so fixtures cannot drift from the endpoint.
 */
function storedCap(record: { codeSize: number; payloadSize?: number }): number {
  return record.payloadSize ?? record.codeSize;
}

describe("POST /api/share", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-03-29T18:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("rejects non-JSON requests and invalid payloads", async () => {
    const { env } = createMockEnv();

    const invalidType = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "oops",
        }),
        env: env as never,
      }) as never,
    );
    expect(invalidType.status).toBe(400);
    await expect(invalidType.json()).resolves.toEqual({
      error: "Expected application/json.",
    });

    const invalidCode = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({ code: "" }),
        }),
        env: env as never,
      }) as never,
    );
    expect(invalidCode.status).toBe(400);
    await expect(invalidCode.json()).resolves.toEqual({
      error: "Missing or invalid code.",
    });
  });

  // WEB-3: a malformed JSON body threw an unhandled SyntaxError (no Response at
  // all -> 500 worker exception), and the rate-limit quota was already charged.
  it("returns a typed 400 for a malformed JSON body without charging the rate limit", async () => {
    const { env, limiterStore, kvStore } = createMockEnv();

    const response = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.9",
          },
          body: '{"code":}',
        }),
        env: env as never,
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JSON body.",
    });
    // No quota consumed for a request that never reached storage.
    expect([...limiterStore.entries()]).toEqual([]);
    expect([...kvStore.keys()]).toEqual([]);
  });

  it("does not charge the rate limit for requests rejected by validation", async () => {
    const { env, limiterStore } = createMockEnv();

    const response = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.9",
          },
          body: JSON.stringify({ code: "" }),
        }),
        env: env as never,
      }) as never,
    );

    expect(response.status).toBe(400);
    expect([...limiterStore.entries()]).toEqual([]);
  });

  it("still charges the rate limit for a share that is actually stored", async () => {
    const { env, limiterStore } = createMockEnv();

    const response = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.9",
          },
          body: JSON.stringify({ code: "cube(10);" }),
        }),
        env: env as never,
      }) as never,
    );

    expect(response.status).toBe(200);
    expect([...limiterStore.values()]).toEqual([1]);
  });

  it("rejects oversized payloads and returns a 500 when unique ids cannot be created", async () => {
    const largeCode = "x".repeat(51_201);
    const { env, kvStore } = createMockEnv();

    const oversized = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({ code: largeCode }),
        }),
        env: env as never,
      }) as never,
    );
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({
      error: "Design is too large (50KB max).",
    });

    kvStore.set(
      "share:aaaaaaaa",
      JSON.stringify({
        id: "aaaaaaaa",
        code: "existing",
        title: "Existing",
        createdAt: "2026-03-29T18:00:00.000Z",
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: 8,
      }),
    );

    const randomSpy = jest
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((buffer: Uint8Array) => {
        buffer.fill(0);
        return buffer;
      });

    const exhausted = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({ code: "cube(10);" }),
        }),
        env: env as never,
      }) as never,
    );
    randomSpy.mockRestore();

    expect(exhausted.status).toBe(500);
    await expect(exhausted.json()).resolves.toEqual({
      error: "Unable to create a unique share link right now.",
    });
  });

  it("persists a sanitized share record and returns the share URL plus thumbnail token", async () => {
    const { env, kvStore } = createMockEnv();

    const response = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({
            code: "cube([10, 10, 10]);",
            title: "  Useful Part  ",
            forkedFrom: "abc12345",
          }),
        }),
        env: env as never,
      }) as never,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      id: string;
      url: string;
      thumbnailUploadToken: string;
    };
    expect(payload.id).toHaveLength(8);
    expect(payload.url).toBe(`https://studio.test/s/${payload.id}`);
    expect(payload.thumbnailUploadToken).toBeTruthy();

    const stored = JSON.parse(kvStore.get(`share:${payload.id}`) ?? "{}") as {
      code: string;
      title: string;
      forkedFrom: string | null;
      thumbnailUploadTokenHash: string | null;
      codeSize: number;
      payloadSize?: number;
    };
    expect(stored.title).toBe("Useful Part");
    expect(stored.forkedFrom).toBe("abc12345");
    expect(stored.thumbnailUploadTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.codeSize).toBe(
      new TextEncoder().encode("cube([10, 10, 10]);").length,
    );
    // Decompress with the record's OWN cap, exactly as functions/api/share/[id].ts does.
    // Using the default 51200 cap here hid WEB-1 for the entire life of the feature.
    await expect(
      decompressSource(stored.code, storedCap(stored)),
    ).resolves.toBe("cube([10, 10, 10]);");
    expect(kvStore.get("ratelimit:198.51.100.7:2026-3-29-18")).toBeUndefined();
  });

  it("accepts .h files in multi-file project shares but requires a .scad render target", async () => {
    const { env, kvStore } = createMockEnv();

    const response = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({
            files: {
              "main.scad":
                "include <lib/constants.h>\ncube([part_w, part_d, part_h]);",
              "lib/constants.h": "part_w = 12; part_d = 8; part_h = 4;",
            },
            renderTarget: "main.scad",
          }),
        }),
        env: env as never,
      }) as never,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { id: string };
    const stored = JSON.parse(kvStore.get(`share:${payload.id}`) ?? "{}") as {
      code: string;
      codeSize: number;
      payloadSize?: number;
    };
    const decoded = JSON.parse(
      await decompressSource(stored.code, storedCap(stored)),
    ) as {
      files: Record<string, string>;
      renderTarget: string;
    };

    expect(decoded.renderTarget).toBe("main.scad");
    expect(decoded.files["lib/constants.h"]).toContain("part_w");

    const invalidRenderTarget = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({
            files: {
              "main.scad": "cube(10);",
              "lib/constants.h": "size = 10;",
            },
            renderTarget: "lib/constants.h",
          }),
        }),
        env: env as never,
      }) as never,
    );

    expect(invalidRenderTarget.status).toBe(400);
    await expect(invalidRenderTarget.json()).resolves.toEqual({
      error: "renderTarget must be a renderable .scad file in the project.",
    });
  });

  // WEB-1: every multi-file project share was created 200 and then read back 422,
  // because the stored decompression cap was the sum of file CONTENT bytes while the
  // stored blob is the whole JSON envelope. This drives BOTH real handlers.
  it("round-trips a multi-file project share from create through public read", async () => {
    const { env } = createMockEnv();

    const files = {
      "main.scad": "include <lib/constants.h>\ncube([part_w, part_d, part_h]);",
      "lib/constants.h": "part_w = 12; part_d = 8; part_h = 4;",
    };

    const created = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({ files, renderTarget: "main.scad" }),
        }),
        env: env as never,
      }) as never,
    );
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };

    const read = await onRequestGet(
      createPagesContext({
        request: new Request(`https://studio.test/api/share/${id}`),
        env: env as never,
        params: { id },
      }) as never,
    );

    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      id,
      files,
      renderTarget: "main.scad",
      code: files["main.scad"],
    });
  });

  it("round-trips a single-file share from create through public read", async () => {
    const { env } = createMockEnv();

    const created = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({ code: "cube([10, 10, 10]);" }),
        }),
        env: env as never,
      }) as never,
    );
    expect(created.status).toBe(200);
    const { id } = (await created.json()) as { id: string };

    const read = await onRequestGet(
      createPagesContext({
        request: new Request(`https://studio.test/api/share/${id}`),
        env: env as never,
        params: { id },
      }) as never,
    );

    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({
      id,
      code: "cube([10, 10, 10]);",
    });
  });

  it("rejects malformed multi-file project shares before persistence", async () => {
    const { env, kvStore } = createMockEnv();

    async function post(body: unknown) {
      return onRequestPost(
        createPagesContext({
          request: new Request("https://studio.test/api/share", {
            method: "POST",
            headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
            body: JSON.stringify(body),
          }),
          env: env as never,
        }) as never,
      );
    }

    const invalidFiles = await post({ files: ["main.scad"], renderTarget: "main.scad" });
    expect(invalidFiles.status).toBe(400);
    await expect(invalidFiles.json()).resolves.toEqual({
      error: "Invalid files format.",
    });

    const missingTarget = await post({ files: { "main.scad": "cube(10);" } });
    expect(missingTarget.status).toBe(400);
    await expect(missingTarget.json()).resolves.toEqual({
      error: "Missing or invalid renderTarget.",
    });

    const emptyProject = await post({ files: {}, renderTarget: "main.scad" });
    expect(emptyProject.status).toBe(400);
    await expect(emptyProject.json()).resolves.toEqual({
      error: "Project must contain at least one file.",
    });

    const pathTraversal = await post({
      files: { "../escape.scad": "cube(10);" },
      renderTarget: "../escape.scad",
    });
    expect(pathTraversal.status).toBe(400);
    await expect(pathTraversal.json()).resolves.toEqual({
      error: "Invalid file path: ../escape.scad",
    });

    const missingFile = await post({
      files: { "main.scad": "cube(10);" },
      renderTarget: "missing.scad",
    });
    expect(missingFile.status).toBe(400);
    await expect(missingFile.json()).resolves.toEqual({
      error: "renderTarget must be a file in the project.",
    });

    const tooManyFiles = Object.fromEntries(
      Array.from({ length: 51 }, (_, index) => [`part${index}.scad`, "cube(1);"]),
    );
    const tooMany = await post({ files: tooManyFiles, renderTarget: "part0.scad" });
    expect(tooMany.status).toBe(400);
    await expect(tooMany.json()).resolves.toEqual({
      error: "Too many files (50 max).",
    });

    const oversized = await post({
      files: { "main.scad": "x".repeat(51_201) },
      renderTarget: "main.scad",
    });
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({
      error: "Project is too large (50KB max across all files).",
    });

    expect([...kvStore.keys()].filter((key) => key.startsWith("share:"))).toEqual([]);
  });

  // WEB-5: shares were written with SHARE_KV.put(key, value) — two arguments,
  // no expirationTtl — so every share was stored forever with no way to retract it.
  it("stores shares with an expiry", async () => {
    const { env, kvPutOptions } = createMockEnv();

    const response = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({ code: "cube(10);" }),
        }),
        env: env as never,
      }) as never,
    );

    const { id } = (await response.json()) as { id: string };
    expect(kvPutOptions.get(`share:${id}`)).toEqual({
      expirationTtl: SHARE_TTL_SECONDS,
    });
    expect(SHARE_TTL_SECONDS).toBeGreaterThanOrEqual(60);
  });

  it("returns a delete token the creator can use to retract the share", async () => {
    const { env, kvStore } = createMockEnv();

    const created = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({ code: "cube(10);" }),
        }),
        env: env as never,
      }) as never,
    );
    const { id, deleteToken } = (await created.json()) as {
      id: string;
      deleteToken: string;
    };
    expect(deleteToken).toBeTruthy();
    // The raw token is never stored — only its hash.
    expect(kvStore.get(`share:${id}`)).not.toContain(deleteToken);

    const deleted = await onRequestDelete(
      createPagesContext({
        request: new Request(`https://studio.test/api/share/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${deleteToken}` },
        }),
        env: env as never,
        params: { id },
      }) as never,
    );
    expect(deleted.status).toBe(200);
    expect(kvStore.get(`share:${id}`)).toBeUndefined();

    // Deleted shares are really gone from the public read path.
    const read = await onRequestGet(
      createPagesContext({
        request: new Request(`https://studio.test/api/share/${id}`),
        env: env as never,
        params: { id },
      }) as never,
    );
    expect(read.status).toBe(404);
  });

  it("refuses to delete a share without a valid delete token", async () => {
    const { env, kvStore } = createMockEnv();

    const created = await onRequestPost(
      createPagesContext({
        request: new Request("https://studio.test/api/share", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "cf-connecting-ip": "198.51.100.7",
          },
          body: JSON.stringify({ code: "cube(10);" }),
        }),
        env: env as never,
      }) as never,
    );
    const { id } = (await created.json()) as { id: string };

    async function attempt(headers: Record<string, string>) {
      return onRequestDelete(
        createPagesContext({
          request: new Request(`https://studio.test/api/share/${id}`, {
            method: "DELETE",
            headers,
          }),
          env: env as never,
          params: { id },
        }) as never,
      );
    }

    expect((await attempt({})).status).toBe(401);
    expect((await attempt({ Authorization: "Bearer wrong-token" })).status).toBe(
      401,
    );
    // Still there.
    expect(kvStore.get(`share:${id}`)).toBeTruthy();

    const missing = await onRequestDelete(
      createPagesContext({
        request: new Request("https://studio.test/api/share/zzzzzzzz", {
          method: "DELETE",
          headers: { Authorization: "Bearer whatever" },
        }),
        env: env as never,
        params: { id: "zzzzzzzz" },
      }) as never,
    );
    expect(missing.status).toBe(404);
  });

  it("removes the stored thumbnail object when a share is deleted", async () => {
    const { env, kvStore, r2Store } = createMockEnv();
    const deleteToken = "retract-me";
    const deleteTokenHash = await hashToken(deleteToken);
    r2Store.set("thumbnails/abc12345.png", new ArrayBuffer(8));
    kvStore.set(
      "share:abc12345",
      JSON.stringify({
        id: "abc12345",
        code: await compressSource("cube(10);"),
        title: "Bracket",
        createdAt: "2026-03-29T18:00:00.000Z",
        forkedFrom: null,
        thumbnailKey: "thumbnails/abc12345.png",
        thumbnailUploadTokenHash: null,
        deleteTokenHash,
        codeSize: 9,
        payloadSize: 9,
      }),
    );

    const deleted = await onRequestDelete(
      createPagesContext({
        request: new Request("https://studio.test/api/share/abc12345", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${deleteToken}` },
        }),
        env: env as never,
        params: { id: "abc12345" },
      }) as never,
    );

    expect(deleted.status).toBe(200);
    expect(kvStore.get("share:abc12345")).toBeUndefined();
    expect(r2Store.has("thumbnails/abc12345.png")).toBe(false);
  });

  it("rejects invalid stored project payloads on public read", async () => {
    // Fixture is written exactly the way the endpoint writes one: codeSize is the
    // sum of file CONTENT bytes, payloadSize is the JSON envelope's byte length.
    // The 422 must come from the payload SHAPE, not from a size cap.
    const serialized = JSON.stringify({
      files: { "main.scad": "cube(10);" },
      renderTarget: "missing.scad",
    });
    const badProject = await compressSource(serialized);
    const { env, kvStore } = createMockEnv({
      "share:badproj1": JSON.stringify({
        id: "badproj1",
        code: badProject,
        title: "Bad Project",
        createdAt: "2026-03-29T18:00:00.000Z",
        forkedFrom: null,
        thumbnailKey: null,
        thumbnailUploadTokenHash: null,
        codeSize: new TextEncoder().encode("cube(10);").length,
        payloadSize: new TextEncoder().encode(serialized).length,
        format: "project",
      }),
    });

    const response = await onRequestGet(
      createPagesContext({
        request: new Request("https://studio.test/api/share/badproj1"),
        env: env as never,
        params: { id: "badproj1" },
      }) as never,
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "Design payload is invalid.",
    });
    expect(kvStore.get("share:badproj1")).toBeTruthy();
  });
});
