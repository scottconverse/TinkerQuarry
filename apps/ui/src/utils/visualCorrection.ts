export const MAX_VISUAL_CORRECTION_ROUNDS = 3;

export function canApplyVisualCorrection(
  prompt: string | null | undefined,
  rounds: number,
  isApplying: boolean
): boolean {
  return Boolean(prompt?.trim()) && rounds < MAX_VISUAL_CORRECTION_ROUNDS && !isApplying;
}

export function visualCorrectionApplyingSummary(rounds: number): string {
  return `Visual review: applying fix ${rounds + 1} of ${MAX_VISUAL_CORRECTION_ROUNDS}`;
}
