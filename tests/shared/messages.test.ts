import { describe, it, expect, vi } from "vitest";
import { sendToActiveTab } from "../../src/shared/messages";

describe("sendToActiveTab", () => {
  it("sends message to active tab", () => {
    sendToActiveTab({ action: "refresh-highlights" });

    expect(chrome.tabs.query).toHaveBeenCalledWith(
      { active: true, currentWindow: true },
      expect.any(Function),
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { action: "refresh-highlights" },
    );
  });

  it("sends toggle-notes message with showNotes", () => {
    sendToActiveTab({ action: "toggle-notes", showNotes: true });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(1, {
      action: "toggle-notes",
      showNotes: true,
    });
  });

  it("does not send message when no active tab", () => {
    // @ts-expect-error -- simplified mock for test
    vi.mocked(chrome.tabs.query).mockImplementationOnce((_q: unknown, cb: Function) => {
      cb([]);
    });

    sendToActiveTab({ action: "refresh-highlights" });

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("does not send message when tab has no id", () => {
    // @ts-expect-error -- simplified mock for test
    vi.mocked(chrome.tabs.query).mockImplementationOnce((_q: unknown, cb: Function) => {
      cb([{ id: undefined }]);
    });

    sendToActiveTab({ action: "refresh-highlights" });

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
