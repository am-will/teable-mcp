import type { Registrar } from "./define.js";

export function registerAccountTools(r: Registrar): void {
  r.tool({
    name: "teable_whoami",
    title: "Current Teable user",
    description:
      "Return the Teable user that the configured access token belongs to. Use it to check that the connection and token work.",
    access: "read",
    input: {},
    handler: (_args, { client }) => client.get("/auth/user"),
  });
}
