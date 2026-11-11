import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getCurrentAdmin: async () => ({ id: "admin", name: "A" }) }));

import { db } from "@/lib/db";
import { getCalendar } from "../data";
import { placeDay } from "../schedule-grid";
import { createWorld, resetDatabase } from "../../../test/db";

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

// 2026-11-11 is a Wednesday. Baku is UTC+4, so 15:00 there is 11:00Z.
const at = (hhmmBaku: string) => new Date(`2026-11-11T${String(Number(hhmmBaku.slice(0, 2)) - 4).padStart(2, "0")}:${hhmmBaku.slice(3)}:00Z`);

async function lessons(w: Awaited<ReturnType<typeof createWorld>>) {
  const otherTeacher = await db.user.create({ data: { name: "Other", email: "o@t.local", passwordHash: "x", role: "teacher" } });
  const otherGroup = await db.group.create({ data: { name: "B1", courseId: w.course.id, teacherId: otherTeacher.id, termId: w.term.id } });
  const make = (groupId: string, teacherId: string, start: string, end: string, status: "scheduled" | "cancelled" = "scheduled") =>
    db.lesson.create({ data: { groupId, teacherId, startsAt: at(start), endsAt: at(end), status } });
  return { otherTeacher, otherGroup, make };
}

describe("getCalendar feeding the week grid (real database)", () => {
  it("carries the teacher's id and the hours in the school's timezone", async () => {
    const w = await createWorld();
    const { make } = await lessons(w);
    await make(w.group.id, w.teacher.id, "15:00", "16:30");
    const wednesday = (await getCalendar({ date: "2026-11-11" })).days.find((d) => d.day === "2026-11-11")!;
    expect(wednesday.lessons).toHaveLength(1);
    expect(wednesday.lessons[0]).toMatchObject({ start: "15:00", end: "16:30", teacherId: w.teacher.id, status: "scheduled" });
  });

  it("lets the grid find a teacher booked into two lessons at once, and nothing else", async () => {
    const w = await createWorld();
    const { otherGroup, otherTeacher, make } = await lessons(w);
    await make(w.group.id, w.teacher.id, "15:00", "16:30"); // teacher A
    await make(otherGroup.id, w.teacher.id, "16:00", "17:00"); // teacher A again, overlapping
    await make(otherGroup.id, otherTeacher.id, "16:00", "17:00"); // a different teacher at the same time: fine
    const wednesday = (await getCalendar({ date: "2026-11-11" })).days.find((d) => d.day === "2026-11-11")!;
    const placed = placeDay(wednesday.lessons);
    expect(placed.map((p) => [p.start, p.teacherId === w.teacher.id, p.clash])).toEqual([
      ["15:00", true, true],
      ["16:00", true, true],
      ["16:00", false, false],
    ]);
    // Three lessons overlap in time, so the grid draws them in three columns.
    expect(placed.map((p) => p.lanes)).toEqual([3, 3, 3]);
  });

  it("does not call a cancelled lesson a double booking", async () => {
    const w = await createWorld();
    const { otherGroup, make } = await lessons(w);
    await make(w.group.id, w.teacher.id, "15:00", "16:00", "cancelled");
    await make(otherGroup.id, w.teacher.id, "15:00", "16:00");
    const wednesday = (await getCalendar({ date: "2026-11-11" })).days.find((d) => d.day === "2026-11-11")!;
    expect(placeDay(wednesday.lessons).map((p) => p.clash)).toEqual([false, false]);
  });
});
