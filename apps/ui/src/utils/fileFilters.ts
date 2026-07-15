import { OPENSCAD_PROJECT_FILE_EXTENSIONS } from "../../../../packages/shared/src/openscadProjectFiles";

/**
 * File-picker filter for OpenSCAD project files (moved verbatim from App.tsx during the
 * v1.5 phase-1c extraction — shared by App.tsx's own open-file flow and the
 * usePersistenceOperations save/menu-bridge cluster).
 */
export const OPENSCAD_FILE_FILTERS = [
  { name: "OpenSCAD Files", extensions: [...OPENSCAD_PROJECT_FILE_EXTENSIONS] },
];
