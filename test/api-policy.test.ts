import { describe, expect, it } from "vitest";
import { ApiPolicyError, checkApiRequest, normalizeApiPath } from "../src/tools/api-policy.js";

describe("normalizeApiPath", () => {
  it("accepts plain paths and strips a leading /api", () => {
    expect(normalizeApiPath("/table/tbl1/record")).toBe("/table/tbl1/record");
    expect(normalizeApiPath("/api/table/tbl1/record")).toBe("/table/tbl1/record");
    expect(normalizeApiPath("/api")).toBe("/");
    expect(normalizeApiPath("  /space  ")).toBe("/space");
  });

  it.each([
    ["space", /start with/],
    ["https://evil.test/x", /start with/],
    ["//evil.test/x", /empty/],
    ["/table/../admin/users", /"\.\."/],
    ["/table/%2e%2e/admin", /"\.\."/],
    ["/table/%2E%2E/admin", /"\.\."/],
    ["/table/x?take=1", /query/],
    ["/table/x#frag", /query/],
    ["/table\\x", /backslashes/],
    ["/table/%zz", /percent-encoding/],
  ])("rejects %s", (input, message) => {
    expect(() => normalizeApiPath(input)).toThrow(ApiPolicyError);
    expect(() => normalizeApiPath(input)).toThrow(message);
  });

  it("rejects control characters inside a path", () => {
    expect(() => normalizeApiPath("/table/x\u0000y")).toThrow(/control/);
  });
});

describe("checkApiRequest", () => {
  it("allows ordinary data calls", () => {
    expect(() => checkApiRequest("GET", "/table/tbl1/record")).not.toThrow();
    expect(() => checkApiRequest("post", "/table/tbl1/record")).not.toThrow();
    expect(() => checkApiRequest("PATCH", "/base/bse1")).not.toThrow();
    expect(() => checkApiRequest("DELETE", "/table/tbl1/record/rec1")).not.toThrow();
  });

  it("rejects unknown methods", () => {
    expect(() => checkApiRequest("TRACE", "/space")).toThrow(/Unsupported method/);
  });

  it.each([
    ["GET", "/access-token"],
    ["POST", "/access-token"],
    ["GET", "/oauth/client"],
    ["GET", "/credential"],
    ["GET", "/admin/user"],
    ["GET", "/billing/subscription"],
    ["POST", "/auth/signin"],
    ["DELETE", "/auth/user"],
    ["PATCH", "/auth/user/name"],
    ["GET", "/Admin/user"],
  ])("blocks %s %s", (method, path) => {
    expect(() => checkApiRequest(method, path)).toThrow(/not available/);
  });

  it("still allows reading who the user is", () => {
    expect(() => checkApiRequest("GET", "/auth/user")).not.toThrow();
    expect(() => checkApiRequest("GET", "/auth/user/me")).not.toThrow();
  });

  it("does not block paths that merely start with a blocked word", () => {
    expect(() => checkApiRequest("GET", "/authority/x")).not.toThrow();
    expect(() => checkApiRequest("GET", "/administrators")).not.toThrow();
  });

  it.each([
    "/base/bse1/permanent",
    "/space/spc1/permanent",
    "/base/bse1/table/tbl1/permanent",
    "/trash/trs1",
    "/trash/reset-items",
    "/table/tbl1/archive/items",
    "/table/tbl1/archive/reset",
    "/chat/archived/cht1",
  ])("blocks permanent deletion: DELETE %s", (path) => {
    expect(() => checkApiRequest("DELETE", path)).toThrow(/Permanent deletion/);
  });

  it("allows reading the trash and archive", () => {
    expect(() => checkApiRequest("GET", "/trash/items")).not.toThrow();
    expect(() => checkApiRequest("GET", "/table/tbl1/archive/items")).not.toThrow();
  });

  it.each([
    ["POST", "/base/bse1/collaborator"],
    ["PATCH", "/space/spc1/collaborators"],
    ["DELETE", "/base/bse1/collaborators"],
    ["POST", "/space/spc1/invitation/link"],
    ["POST", "/table/tbl1/view/viw1/enable-share"],
    ["PUT", "/table/tbl1/view/viw1/share-meta"],
    ["POST", "/base/bse1/publish"],
    ["POST", "/space/spc1/integration"],
    ["PUT", "/base-share/x"],
    ["POST", "/space/spc1/billing/attachment-size/refresh"],
    ["POST", "/organization/org1/department"],
    ["DELETE", "/organization/org1/department-user"],
    ["POST", "/plugin/plg1/regenerate-secret"],
    ["POST", "/space/spc1/claw"],
  ])("blocks access-control change: %s %s", (method, path) => {
    expect(() => checkApiRequest(method, path)).toThrow(/sharing, collaborators/);
  });

  it("allows reading collaborators and sharing state", () => {
    expect(() => checkApiRequest("GET", "/base/bse1/collaborators")).not.toThrow();
    expect(() => checkApiRequest("GET", "/space/spc1/invitation/link")).not.toThrow();
    expect(() => checkApiRequest("GET", "/space/spc1/billing/credit-summary")).not.toThrow();
  });
});
