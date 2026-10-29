import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

describe("server", () => {
  it("exposes instructions and the whoami tool", async () => {
    const t = await connectToFakeTeable();
    const instructions = t.client.getInstructions() ?? "";
    expect(instructions).toContain("space (spc...)");
    for (const tool of ["teable_list_fields", "teable_search_api", "teable_api_get", "teable_api_request"]) {
      expect(instructions).toContain(tool);
    }
    const { tools } = await t.client.listTools();
    expect(tools.map((x) => x.name)).toContain("teable_whoami");
  });

  it("only mentions tools that exist", async () => {
    const t = await connectToFakeTeable();
    const names = new Set((await t.client.listTools()).tools.map((x) => x.name));
    const mentioned = (t.client.getInstructions() ?? "").match(/teable_[a-z_]+/g) ?? [];
    expect(mentioned.filter((n) => !names.has(n))).toEqual([]);
  });

  it("never points to a tool that does not exist from a tool description", async () => {
    const t = await connectToFakeTeable();
    const { tools } = await t.client.listTools();
    const names = new Set(tools.map((x) => x.name));
    const dangling = tools.flatMap((tool) =>
      (tool.description?.match(/teable_[a-z_]+/g) ?? []).filter((n) => !names.has(n)).map((n) => `${tool.name} -> ${n}`),
    );
    expect(dangling).toEqual([]);
  });

  it("teable_whoami calls /auth/user with the token", async () => {
    const t = await connectToFakeTeable({ "GET /api/auth/user": { id: "usr1", name: "Ada" } });
    const res = await t.call("teable_whoami");
    expect(res.isError).toBeUndefined();
    expect(JSON.parse(t.text(res))).toEqual({ id: "usr1", name: "Ada" });
    expect(t.calls[0]).toMatchObject({ method: "GET", url: "/api/auth/user" });
  });

  it("surfaces API failures as tool errors", async () => {
    const t = await connectToFakeTeable();
    const res = await t.call("teable_whoami");
    expect(res.isError).toBe(true);
    expect(t.text(res)).toContain("Teable API 404");
  });
});
