import { describe, it, expect } from "vitest";
import { safeParseDate, formatEmailDate, formatEmailRelative } from "../components/email-bits";

describe("Safe date formatting and parsing helpers", () => {
  describe("safeParseDate", () => {
    it("returns null for null, undefined, or empty string", () => {
      expect(safeParseDate(null)).toBeNull();
      expect(safeParseDate(undefined)).toBeNull();
      expect(safeParseDate("")).toBeNull();
    });

    it("parses valid ISO string dates", () => {
      const parsed = safeParseDate("2026-06-18T10:00:00.000Z");
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.toISOString()).toBe("2026-06-18T10:00:00.000Z");
    });

    it("parses numeric and string millisecond values (internalDate)", () => {
      const parsedNumeric = safeParseDate(1781764489087);
      const parsedString = safeParseDate("1781764489087");
      
      expect(parsedNumeric).toBeInstanceOf(Date);
      expect(parsedString).toBeInstanceOf(Date);
      expect(parsedNumeric?.getTime()).toBe(1781764489087);
      expect(parsedString?.getTime()).toBe(1781764489087);
    });

    it("parses standard RFC 2822 / Date header strings", () => {
      const parsed = safeParseDate("Thu, 18 Jun 2026 15:35:58 +0530");
      expect(parsed).toBeInstanceOf(Date);
      expect(parsed?.getFullYear()).toBe(2026);
    });

    it("returns null for invalid date strings", () => {
      expect(safeParseDate("not-a-date")).toBeNull();
      expect(safeParseDate("2026-99-99")).toBeNull();
      expect(safeParseDate("12345-invalid")).toBeNull();
    });
  });

  describe("formatEmailDate", () => {
    it("returns 'Unknown date' on invalid input", () => {
      expect(formatEmailDate(null)).toBe("Unknown date");
      expect(formatEmailDate("not-a-date")).toBe("Unknown date");
    });

    it("formats valid dates using the default format", () => {
      // 1781764489087 is approximately Mon Jun 15 2026 (UTC) depending on timezone
      const formatted = formatEmailDate("2026-06-18T10:00:00.000Z");
      expect(formatted).toContain("Jun");
    });

    it("formats valid dates using a custom format", () => {
      const formatted = formatEmailDate("2026-06-18T10:00:00.000Z", "yyyy-MM-dd");
      expect(formatted).toBe("2026-06-18");
    });
  });

  describe("formatEmailRelative", () => {
    it("returns 'Unknown date' on invalid input", () => {
      expect(formatEmailRelative(null)).toBe("Unknown date");
      expect(formatEmailRelative("not-a-date")).toBe("Unknown date");
    });

    it("formats relative dates correctly", () => {
      const formatted = formatEmailRelative(new Date());
      expect(formatted).toContain("less than a minute");
    });
  });
});
