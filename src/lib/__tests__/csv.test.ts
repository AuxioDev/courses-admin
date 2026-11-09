import { describe, expect, it } from "vitest";
import { csvCell, csvFile, parseCsvLine } from "../csv";

describe("parseCsvLine", () => {
  it("splits on the delimiter and trims", () => {
    expect(parseCsvLine("Aysel, aysel@x.az ,A1", ",")).toEqual(["Aysel", "aysel@x.az", "A1"]);
  });
  it("keeps delimiters inside quotes and unescapes doubled quotes", () => {
    expect(parseCsvLine('"Smith, Jo","say ""hi""",x', ",")).toEqual(["Smith, Jo", 'say "hi"', "x"]);
  });
  it("supports semicolons (Excel in Russian/Azerbaijani locales)", () => {
    expect(parseCsvLine("Əli;ali@x.az;B2", ";")).toEqual(["Əli", "ali@x.az", "B2"]);
  });
  it("keeps empty fields", () => {
    expect(parseCsvLine("a,,c,", ",")).toEqual(["a", "", "c", ""]);
  });
});

describe("csvCell (spreadsheet formula injection)", () => {
  it("neutralises cells that spreadsheets would run as formulas", () => {
    for (const evil of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) {
      expect(csvCell(evil).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });
  it("quotes cells with commas, quotes, semicolons and newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("leaves plain text alone, including az/ru letters", () => {
    expect(csvCell("Şəhər Москва")).toBe("Şəhər Москва");
  });
});

describe("csvFile", () => {
  it("starts with a BOM so Excel reads UTF-8, and uses CRLF rows", () => {
    const out = csvFile([["Name", "Mark"], ["Əli", "90"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe("Name,Mark\r\nƏli,90\r\n");
  });
});
