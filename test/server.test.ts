import { describe, expect, it } from "vitest";
import { connectToFakeTeable } from "./helpers.js";

describe("server", () => {
  it("exposes instructions and the whoami tool", async () => {
    const t = await connectToFakeTeable();
    expect(t.client.getInstructions()).toContain("space (spc...)");
    const { tools } = await t.client.listTools();
    expect(tools.map((x) => x.name)).toContain("teable_whoami");
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
