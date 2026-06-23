import { getManufacturingWorkflowState } from "../manufacturingWorkflow";

describe("manufacturing workflow state", () => {
  const base = {
    hasEngineDesign: true,
    currentRid: 42,
    lastSlicedRid: null,
    sliceProfileStatus: "ready" as const,
    printerKey: "bambu-a1",
    material: "PLA",
    connectorName: "",
  };

  it("reports slice profile readiness separately from send readiness", () => {
    expect(getManufacturingWorkflowState(base)).toMatchObject({
      sliceProfileReady: true,
      canSendCurrentSlice: false,
      sliceState: "Ready to slice",
      sendState: "Waiting for slice",
    });
  });

  it("fails closed when profiles are loading or incomplete", () => {
    expect(
      getManufacturingWorkflowState({
        ...base,
        sliceProfileStatus: "loading",
        printerKey: "",
      }),
    ).toMatchObject({
      sliceProfileReady: false,
      sliceState: "Loading profiles",
      sendState: "Waiting for slice",
    });

    expect(
      getManufacturingWorkflowState({
        ...base,
        material: "",
      }),
    ).toMatchObject({
      sliceProfileReady: false,
      sliceState: "Needs profile",
      sendState: "Waiting for slice",
    });
  });

  it("only permits send for the current sliced design", () => {
    expect(
      getManufacturingWorkflowState({
        ...base,
        lastSlicedRid: 41,
        connectorName: "octoprint",
      }),
    ).toMatchObject({
      canSendCurrentSlice: false,
      sliceState: "Ready to slice",
      sendState: "Waiting for slice",
    });

    expect(
      getManufacturingWorkflowState({
        ...base,
        lastSlicedRid: 42,
      }),
    ).toMatchObject({
      canSendCurrentSlice: true,
      sliceState: "Sliced",
      sendState: "Choose printer",
    });

    expect(
      getManufacturingWorkflowState({
        ...base,
        lastSlicedRid: 42,
        connectorName: "octoprint",
      }),
    ).toMatchObject({
      canSendCurrentSlice: true,
      sliceState: "Sliced",
      sendState: "Ready for octoprint",
    });
  });
});
