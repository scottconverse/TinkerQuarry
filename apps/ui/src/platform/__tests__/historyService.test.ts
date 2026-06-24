import { historyService } from "../historyService";

describe("historyService", () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");

  beforeEach(() => {
    historyService.clear();
  });

  afterEach(() => {
    historyService.clear();
    if (originalCrypto) {
      Object.defineProperty(globalThis, "crypto", originalCrypto);
    }
  });

  it("creates checkpoints when crypto.randomUUID is unavailable", () => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues(bytes: Uint8Array) {
          for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = index;
          }
          return bytes;
        },
      },
    });

    const checkpointId = historyService.createCheckpoint(
      "cube(10);",
      [],
      "Initial",
      "user",
    );

    expect(checkpointId).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    expect(historyService.getAll()).toHaveLength(1);
  });

  it("keeps branch history when forking from an earlier checkpoint", () => {
    const first = historyService.createCheckpoint(
      "cube(1);",
      [],
      "Initial",
      "user",
    );
    historyService.createCheckpoint("cube(2);", [], "Second", "ai");

    const branchId = historyService.createBranchFrom(first, "Try taller part");
    expect(branchId).toBeTruthy();
    const branched = historyService.createCheckpoint(
      "cube([1,1,4]);",
      [],
      "Taller branch",
      "ai",
    );

    const tree = historyService.getTree();
    const root = tree.find((checkpoint) => checkpoint.id === first);
    const branch = tree.find((checkpoint) => checkpoint.id === branched);

    expect(root?.children).toHaveLength(2);
    expect(branch?.parent_id).toBe(first);
    expect(branch?.branch_name).toBe("Try taller part");
    expect(historyService.getBranches()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "main", checkpoint_count: 2 }),
        expect.objectContaining({ id: branchId, checkpoint_count: 1 }),
      ]),
    );
  });
});
