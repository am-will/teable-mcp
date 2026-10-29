import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("requires a token", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ TEABLE_TOKEN: "   " })).toThrow(/TEABLE_TOKEN/);
  });

  it("defaults to Teable Cloud and read/write", () => {
    expect(loadConfig({ TEABLE_TOKEN: "t" })).toEqual({
      token: "t",
      apiUrl: "https://app.teable.ai/api",
      readOnly: false,
    });
  });

  it("accepts TEABLE_API_KEY as an alias", () => {
    expect(loadConfig({ TEABLE_API_KEY: "k" }).token).toBe("k");
  });

  it.each([
    ["https://teable.example.com", "https://teable.example.com/api"],
    ["https://teable.example.com/", "https://teable.example.com/api"],
    ["https://teable.example.com/api", "https://teable.example.com/api"],
    ["https://teable.example.com/api/", "https://teable.example.com/api"],
    ["https://example.com/teable", "https://example.com/teable/api"],
  ])("normalizes base url %s", (input, expected) => {
    expect(loadConfig({ TEABLE_TOKEN: "t", TEABLE_BASE_URL: input }).apiUrl).toBe(expected);
  });

  it("rejects plain http except for loopback", () => {
    expect(() => loadConfig({ TEABLE_TOKEN: "t", TEABLE_BASE_URL: "http://teable.example.com" })).toThrow(/https/);
    expect(loadConfig({ TEABLE_TOKEN: "t", TEABLE_BASE_URL: "http://localhost:3000" }).apiUrl).toBe(
      "http://localhost:3000/api",
    );
  });

  it("rejects an invalid url", () => {
    expect(() => loadConfig({ TEABLE_TOKEN: "t", TEABLE_BASE_URL: "not a url" })).toThrow(/valid URL/);
  });

  it("parses TEABLE_READ_ONLY", () => {
    expect(loadConfig({ TEABLE_TOKEN: "t", TEABLE_READ_ONLY: "true" }).readOnly).toBe(true);
    expect(loadConfig({ TEABLE_TOKEN: "t", TEABLE_READ_ONLY: "1" }).readOnly).toBe(true);
    expect(loadConfig({ TEABLE_TOKEN: "t", TEABLE_READ_ONLY: "false" }).readOnly).toBe(false);
  });
});
