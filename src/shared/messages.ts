import { ExtensionMessage } from "./types";

export function sendToActiveTab(message: ExtensionMessage): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId !== undefined) {
      chrome.tabs.sendMessage(tabId, message).catch(() => {});
    }
  });
}
