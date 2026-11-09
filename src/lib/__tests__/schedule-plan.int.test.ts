import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db";
import { addDays, dayKey } from "../dates";
import { buildSchedulePlan, loadScheduleGroup } from "../schedule-plan";
import { slotInstant } from "../schedule-rules";
import { SCHOOL_TIMEZONE as TZ } from "../school";
import { resetDatabase } from "../../../test/db";

const MON = 1;
const WED = 3;
const rule = (weekday: number, startTime: string, endTime: string) => ({ weekday, startTime, endTime });

// A term of exactly 14 consecutive days starting tomorrow: every weekday occurs exactly twice,
// so the number of lessons a rule should create is known without re-implementing the calendar.
async function world(opts: { groupName?: string; teacherId?: string } = {}) {
  const tomorrow = addDays(dayKey(new Date(), TZ), 1);
  const term = await db.term.create({
    data: { name: "T", startDate: new Date(`${tomorrow}T00:00:00Z`), endDate: new Date(`${addDays(tomorrow, 13)}T00:00:00Z`) },
  });
  const teacher = opts.teacherId
    ? { id: opts.teacherId }
    : await db.user.create({ data: { name: "T", email: `t${Math.random()}@x.az`, passwordHash: "x", role: "teacher" } });
  const course = await db.course.create({ data: { title: "C" } });
  const group = await db.group.create({
    data: { name: opts.groupName ?? "A1", courseId: course.id, teacherId: teacher.id, termId: term.id },
  });
  return { term, teacher, course, group, tomorrow };
}

async function planFor(groupId: string, draft: ReturnType<typeof rule>[]) {
  const group = await loadScheduleGroup(groupId);
  return buildSchedulePlan(group!, draft);
}

async function lessonAt(groupId: string, teacherId: string, day: string, start: string, end: string, status: "scheduled" | "done" | "moved" = "scheduled") {
  return db.lesson.create({
    data: { groupId, teacherId, startsAt: slotInstant(day, start, TZ), endsAt: slotInstant(day, end, TZ), status },
  });
}

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe("buildSchedulePlan", () => {
  it("creates one lesson per rule per week of the term (2 weeks → 2 each)", async () => {
    const w = await world();
    const plan = await planFor(w.group.id, [rule(MON, "10:00", "11:00"), rule(WED, "14:00", "15:30")]);
    expect(plan.create).toHaveLength(4);
    expect(plan.remove).toEqual([]);
    expect(plan.create.every((c) => c.clash === null)).toBe(true);
    expect(plan.create.map((c) => c.start).sort()).toEqual(["10:00", "10:00", "14:00", "14:00"]);
    // Every lesson lies inside the term and in the future.
    for (const c of plan.create) {
      expect(c.day >= w.tomorrow && c.day <= addDays(w.tomorrow, 13)).toBe(true);
      expect(new Date(c.id).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("creates nothing without rules", async () => {
    const w = await world();
    expect((await planFor(w.group.id, [])).create).toEqual([]);
  });

  it("is idempotent: once the lessons exist, the same rules create nothing more", async () => {
    const w = await world();
    const draft = [rule(MON, "10:00", "11:00")];
    const first = await planFor(w.group.id, draft);
    for (const c of first.create) await lessonAt(w.group.id, w.teacher.id, c.day, "10:00", "11:00");
    await db.scheduleRule.create({ data: { groupId: w.group.id, ...draft[0] } });
    const second = await planFor(w.group.id, draft);
    expect(second.create).toEqual([]);
    expect(second.rulesChanged).toBe(false);
  });

  it("flags a teacher double-booking in another group", async () => {
    const w = await world({ groupName: "A1" });
    const other = await world({ groupName: "B1", teacherId: w.teacher.id });
    const probe = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    await lessonAt(other.group.id, w.teacher.id, probe.create[0].day, "10:30", "11:30");
    const plan = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    const clashing = plan.create.filter((c) => c.clash);
    expect(clashing).toHaveLength(1);
    expect(clashing[0].clash).toEqual({ kind: "teacher", group: "B1" });
  });

  it("flags an overlap with the group's own lesson at another time as a group clash", async () => {
    const w = await world();
    const probe = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    await lessonAt(w.group.id, w.teacher.id, probe.create[0].day, "10:30", "11:30");
    const plan = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    expect(plan.create.find((c) => c.clash)?.clash).toEqual({ kind: "group", group: "A1" });
  });

  it("back-to-back lessons are not a clash", async () => {
    const w = await world();
    const probe = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    await lessonAt(w.group.id, w.teacher.id, probe.create[0].day, "11:00", "12:00");
    const plan = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    expect(plan.create.every((c) => c.clash === null)).toBe(true);
  });

  it("ignores cancelled lessons when looking for clashes", async () => {
    const w = await world();
    const probe = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    const l = await lessonAt(w.group.id, w.teacher.id, probe.create[0].day, "10:30", "11:30");
    await db.lesson.update({ where: { id: l.id }, data: { status: "cancelled" } });
    const plan = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    expect(plan.create.every((c) => c.clash === null)).toBe(true);
  });

  describe("when a rule is removed", () => {
    async function withSavedRule() {
      const w = await world();
      await db.scheduleRule.create({ data: { groupId: w.group.id, ...rule(MON, "10:00", "11:00") } });
      const created = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
      const lessons = [];
      for (const c of created.create) lessons.push(await lessonAt(w.group.id, w.teacher.id, c.day, "10:00", "11:00"));
      return { w, lessons };
    }

    it("removes its empty future lessons", async () => {
      const { w, lessons } = await withSavedRule();
      const plan = await planFor(w.group.id, []);
      expect(plan.remove.map((r) => r.id).sort()).toEqual(lessons.map((l) => l.id).sort());
      expect(plan.leftAlone).toEqual([]);
    });

    it("leaves lessons that already have attendance, homework or marks", async () => {
      const { w, lessons } = await withSavedRule();
      const student = await db.user.create({ data: { name: "S", email: "s@x.az", passwordHash: "x", role: "student" } });
      await db.attendance.create({ data: { lessonId: lessons[0].id, studentId: student.id, status: "present" } });
      const plan = await planFor(w.group.id, []);
      expect(plan.remove.map((r) => r.id)).toEqual([lessons[1].id]);
      expect(plan.leftAlone).toMatchObject([{ id: lessons[0].id, reason: "hasWork" }]);
    });

    it("leaves done and moved lessons alone", async () => {
      const { w, lessons } = await withSavedRule();
      await db.lesson.update({ where: { id: lessons[0].id }, data: { status: "done" } });
      await db.lesson.update({ where: { id: lessons[1].id }, data: { status: "moved" } });
      const plan = await planFor(w.group.id, []);
      expect(plan.remove).toEqual([]);
      expect(plan.leftAlone.map((l) => l.reason).sort()).toEqual(["done", "moved"]);
    });
  });

  it("changing only the end time updates existing lessons instead of recreating them", async () => {
    const w = await world();
    await db.scheduleRule.create({ data: { groupId: w.group.id, ...rule(MON, "10:00", "11:00") } });
    const created = await planFor(w.group.id, [rule(MON, "10:00", "11:00")]);
    for (const c of created.create) await lessonAt(w.group.id, w.teacher.id, c.day, "10:00", "11:00");
    const plan = await planFor(w.group.id, [rule(MON, "10:00", "12:00")]);
    expect(plan.rulesChanged).toBe(true);
    expect(plan.create).toEqual([]);
    expect(plan.update).toHaveLength(2);
    expect(plan.update.every((u) => u.newEnd === "12:00")).toBe(true);
  });

  it("creates nothing for a term that is already over", async () => {
    const w = await world();
    await db.term.update({
      where: { id: w.term.id },
      data: { startDate: new Date("2020-01-01T00:00:00Z"), endDate: new Date("2020-02-01T00:00:00Z") },
    });
    expect((await planFor(w.group.id, [rule(MON, "10:00", "11:00")])).create).toEqual([]);
  });
});
