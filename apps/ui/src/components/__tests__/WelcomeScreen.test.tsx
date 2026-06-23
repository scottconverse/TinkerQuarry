/** @jest-environment jsdom */

import { screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "jest-axe";
import { jest } from "@jest/globals";
import { clearApiKey, storeApiKey } from "../../stores/apiKeyStore";
import { renderWithProviders } from "./test-utils";

const mockGetPlatform = jest.fn();

jest.unstable_mockModule("@/platform", () => ({
  getPlatform: () => mockGetPlatform(),
}));

let WelcomeScreen: typeof import("../WelcomeScreen").WelcomeScreen;

function createJsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("WelcomeScreen", () => {
  beforeAll(async () => {
    ({ WelcomeScreen } = await import("../WelcomeScreen"));
  });

  beforeEach(() => {
    localStorage.clear();
    clearApiKey("anthropic");
    clearApiKey("openai");
    storeApiKey("openai", "openai-test-key");
    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: false },
      fileExists: jest.fn(async () => false),
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: jest.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();

        if (url.includes("api.openai.com")) {
          return createJsonResponse({
            data: [{ id: "gpt-5.4" }, { id: "gpt-5" }],
          });
        }
        if (url.includes("/api/model-status")) {
          return createJsonResponse({
            model: "gemma4:e4b",
            backend: "local",
            running: true,
            model_present: true,
            vision_model: "qwen2.5vl:7b",
            vision_present: true,
          });
        }

        return createJsonResponse({ data: [], has_more: false });
      }),
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("shows the My Designs section and reopens a saved design on click (§6.12)", async () => {
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: jest.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/api/designs")) {
          return createJsonResponse({
            designs: [{ id: "d1", name: "My Coaster", object_type: "coaster" }],
          });
        }
        if (url.includes("/api/model-status")) {
          return createJsonResponse({
            model: "gemma4:e4b",
            backend: "local",
            running: true,
            model_present: true,
            vision_model: "qwen2.5vl:7b",
            vision_present: true,
          });
        }
        return createJsonResponse({ data: [] });
      }),
    });
    const onReopenDesign = jest.fn();
    renderWithProviders(
      <WelcomeScreen
        draft={{ text: "", attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={() => {}}
        onStartManually={() => {}}
        onReopenDesign={onReopenDesign}
        onOpenRecent={async () => "opened"}
      />,
    );
    const button = await screen.findByText("My Coaster");
    fireEvent.click(button);
    expect(onReopenDesign).toHaveBeenCalledWith("d1");
  });

  it("deletes a saved design via the two-step confirm (§6.12)", async () => {
    const calls: string[] = [];
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: jest.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          calls.push(`${init?.method ?? "GET"} ${url}`);
          if (url.includes("/delete")) return createJsonResponse({ ok: true });
          if (url.includes("/api/designs")) {
            return createJsonResponse({
              designs: [
                { id: "d1", name: "My Coaster", object_type: "coaster" },
              ],
            });
          }
          return createJsonResponse({ data: [] });
        },
      ),
    });
    renderWithProviders(
      <WelcomeScreen
        draft={{ text: "", attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={() => {}}
        onStartManually={() => {}}
        onReopenDesign={jest.fn()}
        onOpenRecent={async () => "opened"}
      />,
    );
    await screen.findByText("My Coaster");
    // First click only ARMS the inline confirm — nothing is deleted on a stray click.
    fireEvent.click(screen.getByTestId("delete-design-d1"));
    expect(screen.getByTestId("confirm-delete-d1")).toBeTruthy();
    expect(calls.some((c) => c.includes("/delete"))).toBe(false);
    // Confirming actually deletes (POST .../delete) and removes the entry in place.
    fireEvent.click(screen.getByTestId("confirm-delete-d1"));
    await waitFor(() =>
      expect(screen.queryByTestId("confirm-delete-d1")).toBeNull(),
    );
    expect(screen.queryByTestId("delete-design-d1")).toBeNull();
    expect(calls.some((c) => c === "POST /api/designs/d1/delete")).toBe(true);
  });

  it("has no serious or critical accessibility violations on the describe surface (§10/§12)", async () => {
    const { container } = renderWithProviders(
      <WelcomeScreen
        draft={{ text: "", attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={() => {}}
        onStartManually={() => {}}
        onOpenRecent={async () => "opened"}
        showRecentFiles={false}
      />,
    );
    // Let the async sections (My Designs fetch) settle so axe sees the full tree.
    await screen.findByText("Try an example:");
    const results = await axe(container);
    const seriousOrCritical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    if (seriousOrCritical.length > 0) {
      // Surface the details so a failure is actionable, not opaque.
      console.error(
        "a11y serious/critical:",
        JSON.stringify(
          seriousOrCritical.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.length,
          })),
          null,
          2,
        ),
      );
    }
    expect(seriousOrCritical).toEqual([]);
  });

  it("shows the model selector inline with the welcome composer actions when an API key is configured", async () => {
    renderWithProviders(
      <WelcomeScreen
        draft={{ text: "", attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={() => {}}
        onStartManually={() => {}}
        onOpenRecent={async () => "opened"}
        currentModel="gpt-5.4"
        availableProviders={["openai"]}
        onModelChange={() => {}}
        showRecentFiles={false}
      />,
    );

    expect(screen.getByTestId("welcome-ai-entry").className).toContain(
      "ph-no-capture",
    );
    const combobox = await screen.findByRole("combobox");
    expect(combobox).toBeTruthy();
    await waitFor(() => {
      expect(combobox.textContent).toContain("GPT-5.4");
    });
  });

  it("prunes missing recent files before rendering them", async () => {
    localStorage.setItem(
      "openscad-studio-recent-files",
      JSON.stringify([
        { path: "/tmp/exists.scad", name: "exists.scad", lastOpened: 2 },
        { path: "/tmp/missing.scad", name: "missing.scad", lastOpened: 3 },
      ]),
    );

    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: true },
      fileExists: jest.fn(async (path: string) => path === "/tmp/exists.scad"),
    });

    renderWithProviders(
      <WelcomeScreen
        draft={{ text: "", attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={() => {}}
        onStartManually={() => {}}
        onOpenRecent={async () => "opened"}
      />,
    );

    expect(await screen.findByText("exists.scad")).toBeTruthy();
    expect(screen.queryByText("missing.scad")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem("openscad-studio-recent-files") || "[]"),
    ).toEqual([
      { path: "/tmp/exists.scad", name: "exists.scad", lastOpened: 2 },
    ]);
  });

  it("shows the describe surface with no cloud provider (TinkerQuarry local-first; no provider wall)", async () => {
    clearApiKey("openai");
    clearApiKey("anthropic");
    mockGetPlatform.mockReturnValue({
      capabilities: { hasFileSystem: true },
      fileExists: jest.fn(async () => false),
    });

    renderWithProviders(
      <WelcomeScreen
        draft={{ text: "", attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={() => {}}
        onStartManually={() => {}}
        onOpenRecent={async () => "opened"}
        onOpenSettings={() => {}}
        showRecentFiles={false}
      />,
    );

    // Local-first: the bundled engine is the brain, so the describe surface is shown and the old
    // "Configure an AI provider" wall is gone even with no cloud key configured.
    expect(
      screen.queryByText("Configure an AI provider to use the AI assistant"),
    ).toBeNull();
    expect(screen.getByText("Try an example:")).toBeTruthy();
  });

  it("allows first-run local-engine builds without a cloud provider", async () => {
    clearApiKey("openai");
    clearApiKey("anthropic");
    const onStartWithDraft = jest.fn();

    renderWithProviders(
      <WelcomeScreen
        draft={{ text: "make a small gear", attachmentIds: [] }}
        attachments={{}}
        draftErrors={[]}
        canSubmitDraft={false}
        isProcessingAttachments={false}
        onDraftTextChange={() => {}}
        onDraftFilesSelected={() => {}}
        onDraftRemoveAttachment={() => {}}
        onStartWithDraft={onStartWithDraft}
        onStartManually={() => {}}
        onOpenRecent={async () => "opened"}
        showRecentFiles={false}
      />,
    );

    expect(screen.queryByText("No AI provider configured")).toBeNull();
    const buildButton = screen.getByRole("button", { name: "Build" });
    await waitFor(() => expect(buildButton).not.toBeDisabled());

    fireEvent.click(buildButton);
    expect(onStartWithDraft).toHaveBeenCalledTimes(1);
  });
});
