import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentAdmin: async () => ({ id: "admin", name: "A" }) }));

import { db } from "@/lib/db";
import { progressByGroup } from "../student-progress";
import { createWorld, resetDatabase } from "../../../test/db";

const HOUR = 3_600_000;
let n = 0;
const student = (name: string) =>
  db.user.create({ data: { name, email: `${name.toLowerCase()}${++n}@t.local`, passwordHash: "x", role: "student" } });

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

// Student A is struggling on every measure, B has done nothing yet, C has left the group.
async function world() {
  const w = await createWorld();
  const a = w.student;
  const b = await student("Bea");
  const c = await student("Cem");
  await db.enrollment.create({ data: { groupId: w.group.id, studentId: b.id } });
  await db.enrollment.create({ data: { groupId: w.group.id, studentId: c.id, status: "dropped" } });

  const lessons = await Promise.all(
    [0, 1, 2, 3].map((i) =>
      db.lesson.create({
        data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: new Date(Date.now() - (10 - i) * HOUR), endsAt: new Date(Date.now() - (9 - i) * HOUR) },
      }),
    ),
  );
  const statuses = ["present", "present", "absent", "late"] as const;
  for (const [i, status] of statuses.entries()) {
    await db.attendance.create({ data: { lessonId: lessons[i].id, studentId: a.id, status } });
  }
  // Student A: 80 (weight 1) and 40 (weight 3) → (80 + 120) / 4 = 50.
  await db.mark.create({ data: { studentId: a.id, groupId: w.group.id, type: "classwork", value: 80, weight: 1, createdBy: w.teacher.id } });
  await db.mark.create({ data: { studentId: a.id, groupId: w.group.id, type: "exam", value: 40, weight: 3, createdBy: w.teacher.id } });

  // Three homeworks, all past due; A hands in only the first. (createWorld's own is the first one.)
  await db.homework.update({ where: { id: w.homework.id }, data: { dueAt: new Date(Date.now() - HOUR) } });
  const hw2 = await db.homework.create({ data: { groupId: w.group.id, title: "2", dueAt: new Date(Date.now() - HOUR), maxScore: 10 } });
  const hw3 = await db.homework.create({ data: { groupId: w.group.id, title: "3", dueAt: new Date(Date.now() - HOUR), maxScore: 10 } });
  await db.submission.create({ data: { homeworkId: w.homework.id, studentId: a.id, content: "x" } });
  void hw2;
  void hw3;
  return { ...w, a, b, c };
}

describe("progressByGroup (real database)", () => {
  it("computes attendance, average, hand-ins and the at-risk flags per student", async () => {
    const w = await world();
    const rows = (await progressByGroup([w.group.id])).get(w.group.id)!;
    const by = (id: string) => rows.find((r) => r.id === id)!;

    expect(by(w.a.id)).toMatchObject({
      enrolled: true,
      attendanceRate: 0.75,
      average: 50,
      handedIn: 1,
      missed: 2,
      lowAverage: true,
      tooManyMissed: true,
      fallingBehind: true,
    });
    // Nothing recorded for B: no rate and no average, three missed homeworks.
    expect(by(w.b.id)).toMatchObject({ enrolled: true, attendanceRate: null, average: null, handedIn: 0, missed: 3, lowAverage: false, tooManyMissed: true });
    // C left: still listed, but not enrolled and never "falling behind".
    expect(by(w.c.id)).toMatchObject({ enrolled: false, fallingBehind: false });
  });

  it("lists students by name and returns an empty list for a group with no students", async () => {
    const w = await world();
    const empty = await db.group.create({ data: { name: "Empty", courseId: w.course.id, teacherId: w.teacher.id, termId: w.term.id } });
    const result = await progressByGroup([w.group.id, empty.id]);
    expect(result.get(w.group.id)!.map((r) => r.name)).toEqual(["Bea", "Cem", "Student"]);
    expect(result.get(empty.id)).toEqual([]);
  });

  it("keeps groups apart: a student's marks in one group do not count in another", async () => {
    const w = await world();
    const other = await db.group.create({ data: { name: "Other", courseId: w.course.id, teacherId: w.teacher.id, termId: w.term.id } });
    await db.enrollment.create({ data: { groupId: other.id, studentId: w.a.id } });
    const rows = (await progressByGroup([w.group.id, other.id])).get(other.id)!;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: w.a.id, attendanceRate: null, average: null, handedIn: 0, missed: 0 });
  });
});
