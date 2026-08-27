import { describe, expect, it } from "vitest";
import { GROUND_TRUTH } from "@/lib/groundtruth";
import { benchmarkForCitation, benchmarkLine, parseBenchmarkHeader } from "@/lib/benchmark";

describe("parseBenchmarkHeader", () => {
  it("parses a well-formed header", () => {
    const raw = JSON.stringify({ "tsujo-sonmo-tokuyaku": { total: 5, containing: 2, differs: 2, matches: 0 } });
    expect(parseBenchmarkHeader(raw)).toEqual({
      "tsujo-sonmo-tokuyaku": { total: 5, containing: 2, differs: 2, matches: 0 },
    });
  });

  it("returns null for missing, malformed or wrongly shaped input", () => {
    expect(parseBenchmarkHeader(null)).toBeNull();
    expect(parseBenchmarkHeader("not json")).toBeNull();
    expect(parseBenchmarkHeader("[1,2]")).toBeNull();
    expect(parseBenchmarkHeader(JSON.stringify({ x: { total: "5" } }))).toBeNull();
  });
});

describe("benchmarkForCitation", () => {
  it("maps a finding's citation to its ground-truth id", () => {
    const entry = GROUND_TRUTH[2];
    const map = { [entry.id]: { total: 5, containing: 2, differs: 2, matches: 0 } };
    expect(benchmarkForCitation(map, entry.citation)).toEqual(map[entry.id]);
    expect(benchmarkForCitation(map, { ...entry.citation, section: "elsewhere" })).toBeNull();
    expect(benchmarkForCitation(null, entry.citation)).toBeNull();
  });
});

describe("benchmarkLine", () => {
  it("prefixes small corpora and keeps the wording numeric", () => {
    expect(benchmarkLine({ total: 5, containing: 2, differs: 2, matches: 0 })).toBe(
      "Early corpus — in the KAIFŪ corpus, 2 of 5 leases contain a clause on this point; 2 differ from the guideline and 0 match it.",
    );
  });
  it("drops the prefix at 20 and handles singulars", () => {
    expect(benchmarkLine({ total: 20, containing: 1, differs: 1, matches: 0 })).toBe(
      "In the KAIFŪ corpus, 1 of 20 leases contain a clause on this point; 1 differs from the guideline and 0 match it.",
    );
  });
  it("stops after the count when nothing contains the clause", () => {
    expect(benchmarkLine({ total: 5, containing: 0, differs: 0, matches: 0 })).toBe(
      "Early corpus — in the KAIFŪ corpus, 0 of 5 leases contain a clause on this point.",
    );
  });
});
