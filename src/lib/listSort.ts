export type SortDir = "asc" | "desc";

export function compareValues(a: number | string, b: number | string, dir: SortDir) {
  const result = typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : Number(a) - Number(b);
  return dir === "asc" ? result : -result;
}
