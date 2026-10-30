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

  describe("cleans a pasted token", () => {
    const real = "teable_accAbC123.XyZ-789_def";
    it.each([
      ["a trailing newline", `${real}\n`],
      ["a Windows line ending", `${real}\r\n`],
      ["spaces around it", `  ${real}  `],
      ["a Bearer prefix", `Bearer ${real}`],
      ["straight quotes", `"${real}"`],
      ["smart quotes", `\u201C${real}\u201D`],
    ])("quietly accepts %s", (_name, pasted) => {
      const config = loadConfig({ TEABLE_TOKEN: pasted });
      expect(config.token).toBe(real);
      expect(config.notes).toBeUndefined();
    });

    it.each([
      ["a zero-width space", `teable_acc\u200BAbC123.XyZ-789_def`, 1],
      ["a non-breaking space", `${real}\u00A0`.replace("_acc", "_acc\u00A0"), 1],
      ["a newline in the middle", `teable_accAbC123.\nXyZ-789_def`, 1],
      ["terminal paste markers", `\u001b[200~${real}\u001b[201~`, 12],
    ])("removes hidden characters, and says so, for %s", (_name, pasted, removed) => {
      const config = loadConfig({ TEABLE_TOKEN: pasted });
      expect(config.token).toBe(real);
      expect(config.notes).toEqual([`removed ${removed} hidden or non-ASCII character${removed > 1 ? "s" : ""} from TEABLE_TOKEN`]);
      expect(JSON.stringify(config.notes)).not.toContain(real);
    });

    it("rejects a token that is nothing but hidden characters", () => {
      expect(() => loadConfig({ TEABLE_TOKEN: "\u200B\u200B" })).toThrow(/hidden or non-ASCII/);
    });

    it("produces a token Node will put in a header", () => {
      const { token } = loadConfig({ TEABLE_TOKEN: `\u201C${real}\u200B\u201D\n` });
      expect(() => new Headers({ Authorization: `Bearer ${token}` })).not.toThrow();
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
