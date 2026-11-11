import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { analyzeImport, MAX_IMPORT_ROWS } from "../student-import";
import { daysFromNow, resetDatabase } from "../../../test/db";

async function group(name: string, locked = false) {
  const term = await db.term.create({ data: { name: `T-${name}`, startDate: daysFromNow(-70), endDate: daysFromNow(60), locked } });
  const teacher = await db.user.create({ data: { name: "T", email: `t-${name}-${Math.random()}@x.az`, passwordHash: "x", role: "teacher" } });
  const course = await db.course.create({ data: { title: "C" } });
  return db.group.create({ data: { name, courseId: course.id, teacherId: teacher.id, termId: term.id } });
}

const keys = (r: Awaited<ReturnType<typeof analyzeImport>>) => r.problems.map((p) => p.key);

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("analyzeImport", () => {
  it("accepts a clean list and resolves groups", async () => {
    const g = await group("A1");
    const r = await analyzeImport("name,email,group\nƏli Məmmədov,Ali@Example.az,A1\nВера,vera@example.az,A1");
    expect(r.problems).toEqual([]);
    expect(r.rows).toMatchObject([
      { name: "Əli Məmmədov", email: "ali@example.az", groupId: g.id, exists: false },
      { name: "Вера", email: "vera@example.az", groupId: g.id },
    ]);
  });

  it("reads Excel's semicolon files, a BOM, CRLF and blank lines", async () => {
    await group("A1");
    const r = await analyzeImport("﻿name;email;group\r\nAysel;aysel@x.az;A1\r\n\r\n");
    expect(r.problems).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it("needs name and email columns; group is optional", async () => {
    expect(keys(await analyzeImport("fullname,mail\nA,a@x.az"))).toEqual(["headerMissing"]);
    const r = await analyzeImport("name,email\nA,a@x.az");
    expect(r.problems).toEqual([]);
    expect(r.rows[0].groupId).toBeNull();
  });

  it("reports bad names and emails with their line numbers", async () => {
    const r = await analyzeImport("name,email\n,a@x.az\nBob,not-an-email\nCy,c@x.az");
    expect(r.problems).toEqual([
      { line: 2, key: "nameMissing" },
      { line: 3, key: "emailInvalid", value: "not-an-email" },
    ]);
  });

  it("reports duplicate emails inside the file, case-insensitively", async () => {
    const r = await analyzeImport("name,email\nA,a@x.az\nB,A@X.AZ");
    expect(r.problems).toEqual([{ line: 3, key: "emailDuplicate", value: "a@x.az" }]);
  });

  it("marks people who already have an account instead of failing", async () => {
    await db.user.create({ data: { name: "Old", email: "old@x.az", passwordHash: "x", role: "student" } });
    const r = await analyzeImport("name,email\nOld,old@x.az\nNew,new@x.az");
    expect(r.problems).toEqual([]);
    expect(r.rows.map((x) => x.exists)).toEqual([true, false]);
  });

  it("rejects unknown groups, groups in locked terms, and ambiguous names", async () => {
    await group("LOCKED", true);
    await group("DUP");
    await group("DUP");
    const r = await analyzeImport("name,email,group\nA,a@x.az,NOPE\nB,b@x.az,LOCKED\nC,c@x.az,DUP");
    expect(r.problems).toEqual([
      { line: 2, key: "unknownGroup", value: "NOPE" },
      { line: 3, key: "unknownGroup", value: "LOCKED" },
      { line: 4, key: "ambiguousGroup", value: "DUP" },
    ]);
  });

  it(`refuses more than ${MAX_IMPORT_ROWS} rows`, async () => {
    const lines = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `S${i},s${i}@x.az`);
    expect(keys(await analyzeImport(`name,email\n${lines.join("\n")}`))).toContain("tooMany");
  });

  it("treats a spreadsheet formula in the name as plain text (it is only stored, never executed)", async () => {
    const r = await analyzeImport('name,email\n"=HYPERLINK(""http://evil"")",a@x.az');
    expect(r.problems).toEqual([]);
    expect(r.rows[0].name).toBe('=HYPERLINK("http://evil")');
  });
});
