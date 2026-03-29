import { vi } from "vitest";

// Chrome API mock
const storageBacking: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(
        (
          keys: string | string[],
          callback: (result: Record<string, unknown>) => void,
        ) => {
          const keyArr = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const k of keyArr) {
            if (k in storageBacking) result[k] = storageBacking[k];
          }
          callback(result);
        },
      ),
      set: vi.fn(
        (items: Record<string, unknown>, callback?: () => void) => {
          Object.assign(storageBacking, items);
          if (callback) callback();
        },
      ),
    },
  },
  tabs: {
    query: vi.fn(
      (
        _query: unknown,
        callback: (tabs: { id?: number; url?: string }[]) => void,
      ) => {
        callback([{ id: 1, url: "https://example.com/page" }]);
      },
    ),
    sendMessage: vi.fn(() => Promise.resolve()),
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    onInstalled: {
      addListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://fake-id/${path}`),
  },
  contextMenus: {
    create: vi.fn(),
    onClicked: {
      addListener: vi.fn(),
    },
  },
};

// Assign to global
Object.defineProperty(globalThis, "chrome", {
  value: chromeMock,
  writable: true,
});

// Helper to reset storage between tests
export function resetChromeStorage(): void {
  for (const key of Object.keys(storageBacking)) {
    delete storageBacking[key];
  }
}

// Helper to seed storage
export function seedChromeStorage(data: Record<string, unknown>): void {
  Object.assign(storageBacking, data);
}

// Reset all mocks between tests
beforeEach(() => {
  resetChromeStorage();
  vi.clearAllMocks();
});
