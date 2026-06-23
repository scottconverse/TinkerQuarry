export type SliceProfileStatus = "loading" | "ready" | "error";

export interface ManufacturingWorkflowStateInput {
  hasEngineDesign: boolean;
  currentRid: number | null;
  lastSlicedRid: number | null;
  sliceProfileStatus: SliceProfileStatus;
  printerKey: string;
  material: string;
  connectorName: string;
}

export interface ManufacturingWorkflowState {
  sliceProfileReady: boolean;
  canSendCurrentSlice: boolean;
  sliceState: string;
  sendState: string;
}

export function getManufacturingWorkflowState({
  hasEngineDesign,
  currentRid,
  lastSlicedRid,
  sliceProfileStatus,
  printerKey,
  material,
  connectorName,
}: ManufacturingWorkflowStateInput): ManufacturingWorkflowState {
  const sliceProfileReady =
    sliceProfileStatus === "ready" && !!printerKey && !!material;
  const canSendCurrentSlice =
    hasEngineDesign && lastSlicedRid != null && lastSlicedRid === currentRid;
  const sliceState = canSendCurrentSlice
    ? "Sliced"
    : sliceProfileReady
      ? "Ready to slice"
      : sliceProfileStatus === "loading"
        ? "Loading profiles"
        : "Needs profile";
  const sendState = canSendCurrentSlice
    ? connectorName
      ? `Ready for ${connectorName}`
      : "Choose printer"
    : "Waiting for slice";

  return {
    sliceProfileReady,
    canSendCurrentSlice,
    sliceState,
    sendState,
  };
}
