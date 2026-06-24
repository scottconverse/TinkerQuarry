import { createRandomId } from "../utils/randomId";

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  line?: number;
  col?: number;
  message: string;
}

export type ChangeType = "user" | "ai" | "fileload" | "undo" | "redo";

export interface EditorCheckpoint {
  id: string;
  timestamp: number;
  code: string;
  diagnostics: Diagnostic[];
  description: string;
  change_type: ChangeType;
  parent_id: string | null;
  branch_id: string;
  branch_name: string;
}

export interface CheckpointDiff {
  from_id: string;
  to_id: string;
  diff: string;
  added_lines: number;
  removed_lines: number;
}

const MAX_CHECKPOINTS = 50;

class HistoryService {
  private checkpoints: EditorCheckpoint[] = [];
  private currentIndex: number | null = null; // null = at latest
  private activeBranchId = "main";
  private branchNames: Record<string, string> = { main: "Main" };

  createCheckpoint(
    code: string,
    diagnostics: Diagnostic[],
    description: string,
    changeType: ChangeType,
  ): string {
    const parent = this.getCurrentCheckpoint();
    const checkpoint: EditorCheckpoint = {
      id: createRandomId(),
      timestamp: Date.now(),
      code,
      diagnostics,
      description,
      change_type: changeType,
      parent_id: parent?.id ?? null,
      branch_id: this.activeBranchId,
      branch_name: this.branchNames[this.activeBranchId] ?? this.activeBranchId,
    };

    this.checkpoints.push(checkpoint);

    // Maintain max size (remove from front)
    if (this.checkpoints.length > MAX_CHECKPOINTS) {
      this.checkpoints.shift();
    }

    // Reset to latest
    this.currentIndex = null;

    return checkpoint.id;
  }

  createBranchFrom(id: string, name?: string): string | null {
    const base = this.getById(id);
    if (!base) return null;
    const branchId = createRandomId();
    this.branchNames[branchId] =
      name?.trim() || `Branch ${Object.keys(this.branchNames).length}`;
    this.activeBranchId = branchId;
    this.currentIndex = this.checkpoints.findIndex(
      (checkpoint) => checkpoint.id === id,
    );
    return branchId;
  }

  switchBranch(branchId: string): EditorCheckpoint | null {
    const index = findLastIndex(
      this.checkpoints,
      (checkpoint) => checkpoint.branch_id === branchId,
    );
    if (index === -1) return null;
    this.activeBranchId = branchId;
    this.currentIndex = index;
    return this.checkpoints[index] ?? null;
  }

  getTree(): Array<
    EditorCheckpoint & { children: string[]; is_current: boolean }
  > {
    const current = this.getCurrentCheckpoint();
    return this.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      children: this.checkpoints
        .filter((candidate) => candidate.parent_id === checkpoint.id)
        .map((candidate) => candidate.id),
      is_current: current?.id === checkpoint.id,
    }));
  }

  getBranches(): Array<{
    id: string;
    name: string;
    checkpoint_count: number;
    latest_checkpoint_id: string | null;
  }> {
    return Object.entries(this.branchNames).map(([id, name]) => {
      const branchCheckpoints = this.checkpoints.filter(
        (checkpoint) => checkpoint.branch_id === id,
      );
      const latestCheckpoint =
        branchCheckpoints[branchCheckpoints.length - 1] ?? null;
      return {
        id,
        name,
        checkpoint_count: branchCheckpoints.length,
        latest_checkpoint_id: latestCheckpoint?.id ?? null,
      };
    });
  }

  undo(): EditorCheckpoint | null {
    if (this.checkpoints.length === 0) return null;

    let newIndex: number;

    if (this.currentIndex !== null) {
      if (this.currentIndex > 0) {
        newIndex = this.currentIndex - 1;
      } else {
        return null;
      }
    } else {
      if (this.checkpoints.length > 1) {
        newIndex = this.checkpoints.length - 2;
      } else {
        return null;
      }
    }

    this.currentIndex = newIndex;
    return this.checkpoints[newIndex] ?? null;
  }

  redo(): EditorCheckpoint | null {
    if (this.currentIndex === null) return null;

    const newIndex = this.currentIndex + 1;

    if (newIndex < this.checkpoints.length) {
      this.currentIndex = newIndex;
      return this.checkpoints[newIndex] ?? null;
    }

    if (newIndex === this.checkpoints.length) {
      // Back to latest
      this.currentIndex = null;
      return this.checkpoints[this.checkpoints.length - 1] ?? null;
    }

    return null;
  }

  getAll(): EditorCheckpoint[] {
    return [...this.checkpoints];
  }

  getById(id: string): EditorCheckpoint | null {
    return this.checkpoints.find((c) => c.id === id) ?? null;
  }

  restoreTo(id: string): EditorCheckpoint | null {
    const index = this.checkpoints.findIndex((c) => c.id === id);
    if (index === -1) return null;

    this.currentIndex = index;
    this.activeBranchId =
      this.checkpoints[index]?.branch_id ?? this.activeBranchId;
    return this.checkpoints[index] ?? null;
  }

  getDiff(fromId: string, toId: string): CheckpointDiff | null {
    const from = this.getById(fromId);
    const to = this.getById(toId);
    if (!from || !to) return null;

    const fromLines = from.code.split("\n");
    const toLines = to.code.split("\n");

    const lcs = computeLCS(fromLines, toLines);

    let diff = "";
    let addedLines = 0;
    let removedLines = 0;

    let fi = 0;
    let ti = 0;

    for (const common of lcs) {
      // Output removed lines before this common line
      while (fi < fromLines.length && fromLines[fi] !== common) {
        diff += `-${fromLines[fi]}\n`;
        removedLines++;
        fi++;
      }
      // Output added lines before this common line
      while (ti < toLines.length && toLines[ti] !== common) {
        diff += `+${toLines[ti]}\n`;
        addedLines++;
        ti++;
      }
      // Output the common line
      diff += ` ${common}\n`;
      fi++;
      ti++;
    }

    // Remaining lines after LCS
    while (fi < fromLines.length) {
      diff += `-${fromLines[fi]}\n`;
      removedLines++;
      fi++;
    }
    while (ti < toLines.length) {
      diff += `+${toLines[ti]}\n`;
      addedLines++;
      ti++;
    }

    return {
      from_id: fromId,
      to_id: toId,
      diff,
      added_lines: addedLines,
      removed_lines: removedLines,
    };
  }

  canUndo(): boolean {
    if (this.checkpoints.length === 0) return false;
    if (this.currentIndex !== null) return this.currentIndex > 0;
    return this.checkpoints.length > 1;
  }

  canRedo(): boolean {
    if (this.currentIndex === null) return false;
    return this.currentIndex < this.checkpoints.length - 1;
  }

  clear(): void {
    this.checkpoints = [];
    this.currentIndex = null;
    this.activeBranchId = "main";
    this.branchNames = { main: "Main" };
  }

  private getCurrentCheckpoint(): EditorCheckpoint | null {
    if (this.checkpoints.length === 0) return null;
    if (this.currentIndex !== null)
      return this.checkpoints[this.currentIndex] ?? null;
    return this.checkpoints[this.checkpoints.length - 1] ?? null;
  }
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // Build LCS length table
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.push(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result.reverse();
}

export const historyService = new HistoryService();
