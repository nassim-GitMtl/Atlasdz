import { describe, expect, it } from "vitest";
import { formatDzd } from "./catalog.js";

describe("formatDzd", () => {
  it("keeps the Algerian currency explicit in French", () => {
    expect(formatDzd(12500, "fr")).toMatch(/12[\s\u202f]500\u00a0DZD/);
  });

  it("keeps the currency code intact in Arabic", () => {
    expect(formatDzd(6900, "ar")).toContain("DZD");
  });
});
