export class ApiPolicyError extends Error {}

/** Areas that are about accounts, credentials, billing or administration rather than data. Blocked for every method. */
export const BLOCKED_PREFIXES = [
  "/access-token",
  "/oauth",
  "/credential",
  "/admin",
  "/billing",
  "/enterprise",
  "/auth",
  "/user-integration",
];

/** The only /auth endpoints that are safe to read. */
const ALLOWED_AUTH_GETS = new Set(["/auth/user", "/auth/user/me"]);

/** Path segments for sharing, access control, billing and org administration. Changing them is blocked, reading is fine. */
const ACCESS_CONTROL_SEGMENTS = new Set([
  "billing",
  "organization",
  "regenerate-secret",
  "claw",
  "collaborator",
  "collaborators",
  "invitation",
  "enable-share",
  "refresh-share-id",
  "share-meta",
  "publish",
  "authentication",
  "integration",
  "domain-verification",
  "authority-matrix",
  "base-share",
  "share",
]);

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

/** Accept `/table/x` or `/api/table/x`; reject anything that could leave the API or hide a traversal. */
export function normalizeApiPath(input: string): string {
  let p = input.trim();
  if (!p.startsWith("/")) throw new ApiPolicyError(`Path must start with "/": ${input}`);
  if (/[?#\\\u0000-\u001f]/.test(p)) {
    throw new ApiPolicyError("Path must not contain ?, #, backslashes or control characters. Pass query parameters in the query argument.");
  }
  if (p === "/api" || p.startsWith("/api/")) p = p.slice(4) || "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(p);
  } catch {
    throw new ApiPolicyError(`Path is not valid percent-encoding: ${input}`);
  }
  if (decoded.includes("//") || decoded.split("/").some((s) => s === ".." || s === ".")) {
    throw new ApiPolicyError(`Path must not contain empty, "." or ".." segments: ${input}`);
  }
  return p;
}

/** Throws ApiPolicyError if this call is not allowed through the generic tools. `path` must be normalized. */
export function checkApiRequest(method: string, path: string): void {
  const verb = method.toUpperCase();
  if (!METHODS.has(verb)) throw new ApiPolicyError(`Unsupported method ${method}. Use GET, POST, PUT, PATCH or DELETE.`);

  const segments = path.toLowerCase().split("/").filter(Boolean);
  const lower = `/${segments.join("/")}`;
  const blocked = BLOCKED_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}/`));
  if (blocked && !(verb === "GET" && ALLOWED_AUTH_GETS.has(lower))) {
    throw new ApiPolicyError(`${path} is not available through this connector (accounts, tokens, billing and admin are out of scope).`);
  }

  if (verb === "DELETE" && (segments.includes("permanent") || segments[0] === "trash" || segments.some((s) => s.startsWith("archive")))) {
    throw new ApiPolicyError("Permanent deletion is not available through this connector. Do it in the Teable app so it is a deliberate action.");
  }

  if (verb !== "GET" && segments.some((s) => ACCESS_CONTROL_SEGMENTS.has(s))) {
    throw new ApiPolicyError(
      "Changing sharing, collaborators, invitations, access settings, billing or organization admin is not available through this connector. Do it in the Teable app.",
    );
  }
}
