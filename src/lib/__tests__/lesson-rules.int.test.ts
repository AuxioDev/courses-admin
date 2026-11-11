// A teacher or group cannot be in two places at once; students who share another group only earn a warning.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { findLessonOverlaps } from "../lesson-rules";
import { createWorld, resetDatabase } from "../../../test/db";

const at = (h: number) => new Date(`2026-12-01T${String(h).padStart(2, "0")}:00:00Z`);
let n = 0;

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

async function world() {
  const w = await createWorld();
  const otherTeacher = await db.user.create({ data: { name: "Other", email: `o${++n}@t.local`, passwordHash: "x", role: "teacher" } });
  const otherGroup = await db.group.create({ data: { name: "B2", courseId: w.course.id, teacherId: otherTeacher.id, termId: w.term.id } });
  const existing = (groupId: string, teacherId: string, from: number, to: number, status: "scheduled" | "cancelled" = "scheduled") =>
    db.lesson.create({ data: { groupId, teacherId, startsAt: at(from), endsAt: at(to), status } });
  const probe = (from: number, to: number, extra: { excludeId?: string } = {}) =>
    findLessonOverlaps({ groupId: w.group.id, teacherId: w.teacher.id, start: at(from), end: at(to), ...extra });
  return { ...w, otherTeacher, otherGroup, existing, probe };
}

describe("findLessonOverlaps", () => {
  it("is clear when nothing else is scheduled", async () => {
    const w = await world();
    expect(await w.probe(9, 10)).toEqual({ clash: null, sharedWith: null });
  });

  it("reports a clash when the same group already has a lesson at that time", async () => {
    const w = await world();
    await w.existing(w.group.id, w.otherTeacher.id, 9, 11);
    expect((await w.probe(10, 12)).clash).toBe("group");
  });

  it("reports a clash when the same teacher is teaching another group", async () => {
    const w = await world();
    await w.existing(w.otherGroup.id, w.teacher.id, 9, 11);
    expect((await w.probe(10, 12)).clash).toBe("teacher");
  });

  it("reports the group before the teacher when both clash", async () => {
    const w = await world();
    await w.existing(w.otherGroup.id, w.teacher.id, 9, 11);
    await w.existing(w.group.id, w.otherTeacher.id, 9, 11);
    expect((await w.probe(10, 12)).clash).toBe("group");
  });

  it("only warns, naming the other group, when a student is also in a group that meets then", async () => {
    const w = await world();
    await db.enrollment.create({ data: { groupId: w.otherGroup.id, studentId: w.student.id } });
    await w.existing(w.otherGroup.id, w.otherTeacher.id, 9, 11);
    expect(await w.probe(10, 12)).toEqual({ clash: null, sharedWith: "B2" });
  });

  it("ignores a shared student who has left the other group or been deactivated", async () => {
    const w = await world();
    await w.existing(w.otherGroup.id, w.otherTeacher.id, 9, 11);
    await db.enrollment.create({ data: { groupId: w.otherGroup.id, studentId: w.student.id, status: "dropped" } });
    expect((await w.probe(10, 12)).sharedWith).toBeNull();
    await db.enrollment.updateMany({ data: { status: "active" } });
    await db.user.update({ where: { id: w.student.id }, data: { active: false } });
    expect((await w.probe(10, 12)).sharedWith).toBeNull();
  });

  it("ignores cancelled lessons", async () => {
    const w = await world();
    await w.existing(w.group.id, w.teacher.id, 9, 11, "cancelled");
    expect(await w.probe(10, 12)).toEqual({ clash: null, sharedWith: null });
  });

  it("treats back-to-back lessons as fine and one minute of overlap as a clash", async () => {
    const w = await world();
    await w.existing(w.group.id, w.teacher.id, 9, 10);
    expect((await w.probe(10, 11)).clash).toBeNull();
    expect((await w.probe(8, 9)).clash).toBeNull();
    expect((await findLessonOverlaps({ groupId: w.group.id, teacherId: w.teacher.id, start: new Date(at(9).getTime() + 59 * 60_000), end: at(11) })).clash).toBe("group");
  });

  it("does not clash with the lesson being edited", async () => {
    const w = await world();
    const l = await w.existing(w.group.id, w.teacher.id, 9, 11);
    expect((await w.probe(9, 11)).clash).toBe("group");
    expect(await w.probe(9, 11, { excludeId: l.id })).toEqual({ clash: null, sharedWith: null });
  });
});
