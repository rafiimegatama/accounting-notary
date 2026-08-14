import { describe, it, expect } from "vitest";
import { matchCostCategorySuggestions } from "@/lib/enums";

describe("matchCostCategorySuggestions", () => {
  it('"BP" matches BPHTB', () => {
    expect(matchCostCategorySuggestions("BP")).toEqual(["BPHTB"]);
  });

  it('"PN" matches PNBP', () => {
    expect(matchCostCategorySuggestions("PN")).toEqual(["PNBP"]);
  });

  it('"Ma" matches Materai', () => {
    expect(matchCostCategorySuggestions("Ma")).toEqual(["Materai"]);
  });

  it("is case-insensitive", () => {
    expect(matchCostCategorySuggestions("bphtb")).toEqual(["BPHTB"]);
  });

  it("returns no matches for an unrecognized prefix — free text stays allowed by the caller", () => {
    expect(matchCostCategorySuggestions("Zzz")).toEqual([]);
  });

  it("returns nothing for an empty query", () => {
    expect(matchCostCategorySuggestions("")).toEqual([]);
    expect(matchCostCategorySuggestions("   ")).toEqual([]);
  });

  it("only matches prefixes, not substrings elsewhere in the word", () => {
    // "istrasi" appears inside "Biaya Administrasi" but not as a prefix.
    expect(matchCostCategorySuggestions("istrasi")).toEqual([]);
  });
});
