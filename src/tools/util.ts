import { z } from "zod";

/** Zod schema for a Teable id, e.g. `idParam("tbl", "Table")`. */
export const idParam = (prefix: string, what: string) =>
  z.string().min(1).describe(`${what} id, starts with "${prefix}"`);

export const spaceId = idParam("spc", "Space");
export const baseId = idParam("bse", "Base");
export const tableId = idParam("tbl", "Table");
export const fieldId = idParam("fld", "Field");
export const recordId = idParam("rec", "Record");
export const viewId = idParam("viw", "View");

/** Keep only `keys` from an object, or from every object in an array. Other values pass through. */
export function pick(value: unknown, keys: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => pick(v, keys));
  if (typeof value !== "object" || value === null) return value;
  const src = value as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));
}
