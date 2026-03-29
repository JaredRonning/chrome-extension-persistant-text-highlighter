import { describe, it, expect } from "vitest";
import { urlKey, originKey } from "../../src/shared/url";

describe("urlKey", () => {
  it("returns origin + pathname for a valid URL", () => {
    expect(urlKey("https://example.com/path")).toBe(
      "https://example.com/path",
    );
  });

  it("strips trailing slashes", () => {
    expect(urlKey("https://example.com/path/")).toBe(
      "https://example.com/path",
    );
    expect(urlKey("https://example.com/path///")).toBe(
      "https://example.com/path",
    );
  });

  it("strips query params", () => {
    expect(urlKey("https://example.com/path?q=1&b=2")).toBe(
      "https://example.com/path",
    );
  });

  it("strips hash", () => {
    expect(urlKey("https://example.com/path#section")).toBe(
      "https://example.com/path",
    );
  });

  it("strips both query and hash", () => {
    expect(urlKey("https://example.com/path?q=1#hash")).toBe(
      "https://example.com/path",
    );
  });

  it("handles root path", () => {
    expect(urlKey("https://example.com/")).toBe("https://example.com");
    expect(urlKey("https://example.com")).toBe("https://example.com");
  });

  it("preserves port", () => {
    expect(urlKey("https://example.com:8080/path")).toBe(
      "https://example.com:8080/path",
    );
  });

  it("handles http URLs", () => {
    expect(urlKey("http://example.com/path")).toBe(
      "http://example.com/path",
    );
  });

  it("returns original string for invalid URL", () => {
    expect(urlKey("not a url")).toBe("not a url");
    expect(urlKey("://invalid")).toBe("://invalid");
  });

  it("returns empty string for empty input", () => {
    expect(urlKey("")).toBe("");
  });

  it("handles subdomain URLs", () => {
    expect(urlKey("https://sub.example.com/path")).toBe(
      "https://sub.example.com/path",
    );
  });

  it("handles IP addresses", () => {
    expect(urlKey("http://192.168.1.1/path")).toBe(
      "http://192.168.1.1/path",
    );
  });
});

describe("originKey", () => {
  it("returns origin for a valid URL", () => {
    expect(originKey("https://example.com/path")).toBe(
      "https://example.com",
    );
  });

  it("strips path, query, and hash", () => {
    expect(originKey("https://example.com/path?q=1#hash")).toBe(
      "https://example.com",
    );
  });

  it("preserves port", () => {
    expect(originKey("https://example.com:8080/path")).toBe(
      "https://example.com:8080",
    );
  });

  it("handles subdomain", () => {
    expect(originKey("https://sub.example.com/path")).toBe(
      "https://sub.example.com",
    );
  });

  it("handles IP address", () => {
    expect(originKey("http://192.168.1.1/path")).toBe("http://192.168.1.1");
  });

  it("returns original string for invalid URL", () => {
    expect(originKey("not a url")).toBe("not a url");
  });

  it("returns empty string for empty input", () => {
    expect(originKey("")).toBe("");
  });
});
