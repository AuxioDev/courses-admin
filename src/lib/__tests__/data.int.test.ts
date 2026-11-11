// What the admin pages read, against a real database: filters, paging, and the numbers on each screen.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ admin: { id: "admin", name: "Ada Admin", timezone: "Asia/Baku" } }));
vi.mock("@/lib/auth", () => ({ getCurrentAdmin: async () => session.admin }));

import { db } from "@/lib/db";
import * as data from "../data";
import { createWorld, daysFromNow, resetDatabase } from "../../../test/db";

const HOUR = 3_600_000;
let n = 0;
const user = (role: "student" | "teacher" | "admin", name: string, extra: Record<string, unknown> = {}) =>
  db.user.create({ data: { name, email: `${name.toLowerCase().replace(/\W/g, "")}${++n}@t.local`, passwordHash: "x", role, ...extra } });
const lesson = (groupId: string, teacherId: string, startOffsetH: number, extra: Record<string, unknown> = {}) =>
  db.lesson.create({
    data: { groupId, teacherId, startsAt: new Date(Date.now() + startOffsetH * HOUR), endsAt: new Date(Date.now() + (startOffsetH + 1) * HOUR), ...extra },
  });

beforeEach(async () => {
  await resetDatabase();
  session.admin = { id: "admin", name: "Ada Admin", timezone: "Asia/Baku" };
});
afterAll(() => db.$disconnect());

describe("pickCurrentTerm", () => {
  const terms = [
    { id: "c", startDate: "2026-09-01", endDate: "2026-12-31" },
    { id: "b", startDate: "2026-01-01", endDate: "2026-06-30" },
  ];
  it("prefers the term containing today, then the latest one that has started, else none", () => {
    expect(data.pickCurrentTerm(terms, "2026-10-01")?.id).toBe("c");
    expect(data.pickCurrentTerm(terms, "2026-07-15")?.id).toBe("b");
    expect(data.pickCurrentTerm(terms, "2025-01-01")).toBeNull();
    expect(data.pickCurrentTerm([], "2026-10-01")).toBeNull();
  });
});

describe("getUsers", () => {
  it("filters by role, status and a name or email search, ignoring case", async () => {
    await user("student", "Aysel Student");
    await user("student", "Bakhtiyar", { active: false });
    await user("teacher", "Chingiz Teacher", { mustChangePassword: true });
    await user("admin", "Dilara Admin");
    const names = async (f: Parameters<typeof data.getUsers>[0]) => (await data.getUsers(f)).users.map((u) => u.name);
    expect((await names({})).sort()).toEqual(["Aysel Student", "Bakhtiyar", "Chingiz Teacher", "Dilara Admin"]);
    expect(await names({ role: "student" })).toEqual(["Aysel Student", "Bakhtiyar"]);
    expect(await names({ status: "deactivated" })).toEqual(["Bakhtiyar"]);
    expect(await names({ status: "temp" })).toEqual(["Chingiz Teacher"]);
    expect(await names({ q: "AYSEL" })).toEqual(["Aysel Student"]);
    expect(await names({ q: "dilara" })).toEqual(["Dilara Admin"]);
    expect(await names({ role: "teacher", status: "deactivated" })).toEqual([]);
  });

  it("ignores filters it does not recognise instead of failing", async () => {
    await user("student", "Aysel");
    const r = await data.getUsers({ role: "superuser", status: "constructor", q: 42, page: "x" });
    expect(r).toMatchObject({ role: null, status: null, q: "", page: 1, total: 1 });
  });

  it("pages in fifties, in name order, and clamps a page that is out of range", async () => {
    await db.user.createMany({
      data: Array.from({ length: 120 }, (_, i) => ({ name: `User ${String(i).padStart(3, "0")}`, email: `bulk${i}@t.local`, passwordHash: "x", role: "student" as const })),
    });
    const p1 = await data.getUsers({});
    expect([p1.total, p1.pages, p1.users.length, p1.users[0].name]).toEqual([120, 3, 50, "User 000"]);
    const p3 = await data.getUsers({ page: "3" });
    expect([p3.users.length, p3.users[0].name]).toEqual([20, "User 100"]);
    expect((await data.getUsers({ page: "99" })).page).toBe(3);
    expect((await data.getUsers({ page: "0" })).page).toBe(1);
    expect((await data.getUsers({ page: "1.5" })).page).toBe(1);
  });

  it("counts open deletion requests regardless of the filter, and does not select password hashes", async () => {
    await user("student", "Asks", { deletionRequestedAt: new Date() });
    await user("student", "Done", { deletionRequestedAt: new Date(), deletionApprovedAt: new Date() });
    await user("teacher", "Other");
    const r = await data.getUsers({ role: "teacher" });
    expect(r.deletionRequests).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/passwordHash/);
    expect((await data.getUsers({ status: "deletion" })).users.map((u) => u.name)).toEqual(["Asks"]);
  });

  it("caps the search text, and a search made of LIKE characters is harmless (admins may list everyone anyway)", async () => {
    await user("student", "100% Effort");
    await user("student", "Plain");
    expect((await data.getUsers({ q: "x".repeat(500) })).q).toHaveLength(100);
    expect((await data.getUsers({ q: "  %  " })).q).toBe("%");
    expect((await data.getUsers({ q: "'; DROP TABLE users; --" })).total).toBe(0);
    expect(await db.user.count()).toBeGreaterThan(0);
  });
});

describe("getUser", () => {
  it("is null for an unknown id, flags the admin's own account, and counts a teacher's upcoming lessons only", async () => {
    const w = await createWorld();
    expect(await data.getUser("nope")).toBeNull();
    session.admin = { id: w.teacher.id, name: "T", timezone: "Asia/Baku" };
    await lesson(w.group.id, w.teacher.id, 5);
    await lesson(w.group.id, w.teacher.id, 30);
    await lesson(w.group.id, w.teacher.id, 8, { status: "cancelled" });
    await lesson(w.group.id, w.teacher.id, -5);
    const t = await data.getUser(w.teacher.id);
    expect(t).toMatchObject({ role: "teacher", upcomingLessons: 2, isSelf: true, adminTimezone: "Asia/Baku" });
    expect(await data.getUser(w.student.id)).toMatchObject({ upcomingLessons: 0, isSelf: false });
    expect(JSON.stringify(t)).not.toMatch(/passwordHash|sessionVersion/);
  });
});

describe("courses and groups", () => {
  it("hides archived courses unless asked, and counts groups", async () => {
    const w = await createWorld();
    await db.course.create({ data: { title: "Old", archived: true } });
    expect((await data.getCourses(false)).map((c) => [c.title, c.groups])).toEqual([["Math", 1]]);
    expect((await data.getCourses(true)).map((c) => c.title)).toEqual(["Math", "Old"]); // active first
    expect(await data.getCourse("nope")).toBeNull();
    expect((await data.getCourse(w.course.id))?.title).toBe("Math");
  });

  it("lists groups newest term first, filters by term, and counts only students still in", async () => {
    const w = await createWorld();
    const gone = await user("student", "Gone");
    const off = await user("student", "Off", { active: false });
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: gone.id, status: "dropped" } });
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: off.id } });
    const old = await db.term.create({ data: { name: "Old", startDate: daysFromNow(-400), endDate: daysFromNow(-300) } });
    await db.group.create({ data: { name: "Z9", courseId: w.course.id, teacherId: w.teacher.id, termId: old.id } });
    const all = await data.getGroups({});
    expect(all.groups.map((g) => g.name)).toEqual(["A1", "Z9"]);
    expect(all.groups[0].enrollments).toHaveLength(1);
    expect((await data.getGroups({ term: old.id })).groups.map((g) => g.name)).toEqual(["Z9"]);
    expect((await data.getGroups({ term: "nope" })).termId).toBeNull();
  });

  it("offers an archived course, locked term or deactivated teacher only when the group already has it", async () => {
    const w = await createWorld();
    const oldCourse = await db.course.create({ data: { title: "Archived", archived: true } });
    const oldTeacher = await user("teacher", "Retired", { active: false });
    const lockedTerm = await db.term.create({ data: { name: "Locked", startDate: daysFromNow(-400), endDate: daysFromNow(-300), locked: true } });
    const fresh = await data.getGroupOptions();
    expect(fresh.courses.map((c) => c.title)).toEqual(["Math"]);
    expect(fresh.teachers.map((c) => c.name)).toEqual(["Teacher"]);
    expect(fresh.terms.map((c) => c.name)).toEqual(["Fall"]);
    const editing = await data.getGroupOptions({ courseId: oldCourse.id, teacherId: oldTeacher.id, termId: lockedTerm.id });
    expect(editing.courses.map((c) => c.title)).toEqual(["Archived", "Math"]);
    expect(editing.teachers.map((c) => c.name)).toEqual(["Retired", "Teacher"]);
    expect(editing.terms.map((c) => c.name)).toEqual(["Fall", "Locked"]);
    void w;
  });

  it("describes one group: members sorted, who can still be added, upcoming lessons to move, and whether it has history", async () => {
    const w = await createWorld();
    const sub = await user("teacher", "Sub");
    const free = await user("student", "Free");
    await user("student", "Inactive", { active: false });
    const gone = await user("student", "Aaa Gone");
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: gone.id, status: "dropped" } });
    await lesson(w.group.id, w.teacher.id, 5);
    await lesson(w.group.id, w.teacher.id, 6, { status: "cancelled" });
    await lesson(w.group.id, sub.id, 7);
    await lesson(w.group.id, w.teacher.id, -5);
    const g = (await data.getGroup(w.group.id))!;
    expect(g).toMatchObject({ lessonsToMove: 1, substituteLessons: 1, hasHistory: true });
    expect(g.enrollments.map((e) => `${e.status}:${e.student.name}`)).toEqual(["active:Student", "dropped:Aaa Gone"]);
    expect(g.available.map((s) => s.name)).toEqual(["Free"]); // not already in the group, not deactivated
    void free;
    expect(await data.getGroup("nope")).toBeNull();
  });

  it("says a brand-new group has no history", async () => {
    const w = await createWorld();
    await db.homework.deleteMany();
    expect((await data.getGroup(w.group.id))?.hasHistory).toBe(false);
  });
});

describe("getGroupGrades", () => {
  it("shows enrolled students, plus anyone who left after a grade was saved, with rounded averages", async () => {
    const w = await createWorld();
    const left = await user("student", "Left With Grade");
    const leftNoGrade = await user("student", "Left Without");
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: left.id, status: "dropped" } });
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: leftNoGrade.id, status: "dropped" } });
    for (const v of [70, 75, 80]) await db.mark.create({ data: { studentId: w.student.id, groupId: w.group.id, type: "quiz", value: v, createdBy: w.teacher.id } });
    await db.mark.update({ where: { id: (await db.mark.findFirstOrThrow({ where: { value: 80 } })).id }, data: { value: 80.04 } });
    await db.finalGrade.create({ data: { studentId: left.id, groupId: w.group.id, termId: w.term.id, value: 61, published: true } });
    const g = (await data.getGroupGrades(w.group.id))!;
    expect(g.rows.map((r) => [r.name, r.enrolled, r.hasGrade, r.value, r.published])).toEqual([
      ["Left With Grade", false, true, 61, true],
      ["Student", true, false, null, false],
    ]);
    expect(g.rows[1]).toMatchObject({ markCount: 3, average: 75 });
    expect(g.term.locked).toBe(false);
    expect(await data.getGroupGrades("nope")).toBeNull();
  });
});

describe("getGroupSchedule", () => {
  it("returns the weekly rules Monday-first, the term as plain days, and the latest meeting link", async () => {
    const w = await createWorld();
    await db.scheduleRule.createMany({
      data: [
        { groupId: w.group.id, weekday: 0, startTime: "10:00", endTime: "11:00" }, // Sunday goes last
        { groupId: w.group.id, weekday: 3, startTime: "18:00", endTime: "19:00" },
        { groupId: w.group.id, weekday: 1, startTime: "18:00", endTime: "19:00" },
        { groupId: w.group.id, weekday: 1, startTime: "09:00", endTime: "10:00" },
      ],
    });
    await lesson(w.group.id, w.teacher.id, 5, { meetingUrl: "https://meet.example/old" });
    await lesson(w.group.id, w.teacher.id, 50, { meetingUrl: "https://meet.example/new" });
    const s = (await data.getGroupSchedule(w.group.id))!;
    expect(s.scheduleRules.map((r) => `${r.weekday}@${r.startTime}`)).toEqual(["1@09:00", "1@18:00", "3@18:00", "0@10:00"]);
    expect(s.term.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.meetingUrl).toBe("https://meet.example/new");
    expect(s._count.lessons).toBe(2);
    expect(await data.getGroupSchedule("nope")).toBeNull();
  });

  it("has an empty meeting link when no lesson has one", async () => {
    const w = await createWorld();
    expect((await data.getGroupSchedule(w.group.id))?.meetingUrl).toBe("");
  });
});

describe("getLesson", () => {
  it("says what can and cannot be done to an upcoming lesson, and who else is booked then", async () => {
    const w = await createWorld();
    const other = await db.group.create({ data: { name: "B2", courseId: w.course.id, teacherId: w.teacher.id, termId: w.term.id } });
    await db.enrollment.create({ data: { groupId: other.id, studentId: w.student.id } });
    const mine = await lesson(w.group.id, w.teacher.id, 30);
    await db.lesson.create({ data: { groupId: other.id, teacherId: (await user("teacher", "Else")).id, startsAt: mine.startsAt, endsAt: mine.endsAt } });
    const l = (await data.getLesson(mine.id))!;
    expect(l).toMatchObject({ isSubstitute: false, sharedWith: "B2" });
    expect(l.blocks).toEqual({ move: null, cancel: null, restore: null, teacher: null, link: null });
    expect(l.teachers.map((t) => t.name).sort()).toEqual(["Else", "Teacher"]);
    expect(l.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(l.start).toMatch(/^\d{2}:\d{2}$/);
    expect(await data.getLesson("nope")).toBeNull();
  });

  it("blocks changes to a past lesson with attendance, a cancelled one, and anything in a locked term", async () => {
    const w = await createWorld();
    const past = await lesson(w.group.id, w.teacher.id, -30);
    await db.attendance.create({ data: { lessonId: past.id, studentId: w.student.id, status: "present" } });
    const p = (await data.getLesson(past.id))!;
    expect(p.blocks.move).not.toBeNull();
    expect(p.blocks.teacher).not.toBeNull();

    const cancelled = await lesson(w.group.id, w.teacher.id, 40, { status: "cancelled" });
    const c = (await data.getLesson(cancelled.id))!;
    expect(c.blocks.move).toBe("lessonCancelled");
    expect(c.blocks.restore).toBeNull(); // a future cancelled lesson can be brought back
    expect(c.sharedWith).toBeNull();

    await db.term.update({ where: { id: w.term.id }, data: { locked: true } });
    const locked = (await data.getLesson((await lesson(w.group.id, w.teacher.id, 60)).id))!;
    expect(locked.blocks).toMatchObject({ move: "termLocked", cancel: "termLocked", link: "termLocked" });
  });

  it("marks a lesson taught by someone other than the group's teacher as a substitution", async () => {
    const w = await createWorld();
    const sub = await user("teacher", "Sub");
    expect((await data.getLesson((await lesson(w.group.id, sub.id, 30)).id))?.isSubstitute).toBe(true);
  });
});

describe("getCalendar", () => {
  it("falls back to the current week for a bad or impossible date, and always returns seven days from Monday", async () => {
    for (const date of [undefined, "nonsense", "2026-02-30", 5]) {
      const c = await data.getCalendar({ date });
      expect(c.days).toHaveLength(7);
      expect(c.days[0].day).toBe(c.monday);
      expect(c.days.map((d) => d.day)).toContain(c.today);
    }
    const c = await data.getCalendar({ date: "2026-11-11" });
    expect([c.monday, c.days[6].day]).toEqual(["2026-11-09", "2026-11-15"]);
  });

  it("filters by group and by teacher", async () => {
    const w = await createWorld();
    const t2 = await user("teacher", "Zed");
    const g2 = await db.group.create({ data: { name: "B2", courseId: w.course.id, teacherId: t2.id, termId: w.term.id } });
    const noon = new Date("2026-11-11T08:00:00Z");
    await db.lesson.create({ data: { groupId: w.group.id, teacherId: w.teacher.id, startsAt: noon, endsAt: new Date(noon.getTime() + HOUR) } });
    await db.lesson.create({ data: { groupId: g2.id, teacherId: t2.id, startsAt: noon, endsAt: new Date(noon.getTime() + HOUR) } });
    const count = async (f: { group?: string; teacher?: string }) => (await data.getCalendar({ date: "2026-11-11", ...f })).days.flatMap((d) => d.lessons).length;
    expect(await count({})).toBe(2);
    expect(await count({ group: g2.id })).toBe(1);
    expect(await count({ teacher: w.teacher.id })).toBe(1);
    expect(await count({ group: g2.id, teacher: w.teacher.id })).toBe(0);
  });
});

describe("getNewLessonOptions", () => {
  it("offers only groups in terms that are open and not yet over", async () => {
    const w = await createWorld();
    const locked = await db.term.create({ data: { name: "L", startDate: daysFromNow(-5), endDate: daysFromNow(50), locked: true } });
    const over = await db.term.create({ data: { name: "O", startDate: daysFromNow(-300), endDate: daysFromNow(-200) } });
    for (const [name, termId] of [["L1", locked.id], ["O1", over.id]] as const) await db.group.create({ data: { name, courseId: w.course.id, teacherId: w.teacher.id, termId } });
    expect((await data.getNewLessonOptions()).groups.map((g) => g.name)).toEqual(["A1"]);
  });
});

describe("terms", () => {
  it("marks the current term, upcoming ones, and which terms overlap", async () => {
    await db.term.createMany({
      data: [
        { name: "Past", startDate: daysFromNow(-300), endDate: daysFromNow(-200) },
        { name: "Now", startDate: daysFromNow(-10), endDate: daysFromNow(30) },
        { name: "Overlaps", startDate: daysFromNow(20), endDate: daysFromNow(80) },
        { name: "Later", startDate: daysFromNow(200), endDate: daysFromNow(260) },
      ],
    });
    const rows = await data.getTerms();
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(rows.map((r) => r.name)).toEqual(["Later", "Overlaps", "Now", "Past"]);
    expect(rows.filter((r) => r.current).map((r) => r.name)).toEqual(["Now"]);
    expect([by.Later.upcoming, by.Overlaps.upcoming, by.Now.upcoming]).toEqual([true, true, false]);
    expect(by.Now.overlaps).toEqual(["Overlaps"]);
    expect(by.Overlaps.overlaps).toEqual(["Now"]);
    expect(by.Past.overlaps).toEqual([]);
  });

  it("falls back to the latest started term when today is between terms, and to none when nothing has started", async () => {
    await db.term.create({ data: { name: "Gap", startDate: daysFromNow(-100), endDate: daysFromNow(-50) } });
    expect((await data.getTerms()).find((t) => t.current)?.name).toBe("Gap");
    await resetDatabase();
    await db.term.create({ data: { name: "Future", startDate: daysFromNow(50), endDate: daysFromNow(100) } });
    expect((await data.getTerms()).some((t) => t.current)).toBe(false);
  });

  it("returns one term as plain days, or null", async () => {
    const w = await createWorld();
    expect(await data.getTerm("nope")).toBeNull();
    expect(await data.getTerm(w.term.id)).toMatchObject({ name: "Fall", locked: false, startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  });
});

describe("getTermChecklist", () => {
  it("lists per group what is still open before locking a term", async () => {
    const w = await createWorld();
    const s2 = await user("student", "Bea");
    const s3 = await user("student", "Cem");
    for (const s of [s2, s3]) await db.enrollment.create({ data: { groupId: w.group.id, studentId: s.id } });
    await db.finalGrade.create({ data: { studentId: w.student.id, groupId: w.group.id, termId: w.term.id, value: 90, published: true } });
    await db.finalGrade.create({ data: { studentId: s2.id, groupId: w.group.id, termId: w.term.id, value: 70, published: false } });
    await lesson(w.group.id, w.teacher.id, -10); // held in the past, no attendance
    const done = await lesson(w.group.id, w.teacher.id, -20);
    await db.attendance.create({ data: { lessonId: done.id, studentId: w.student.id, status: "present" } });
    await lesson(w.group.id, w.teacher.id, -30, { status: "cancelled" });
    await lesson(w.group.id, w.teacher.id, 10);
    const c = (await data.getTermChecklist(w.term.id))!;
    expect(c.groups).toEqual([{ id: w.group.id, name: "A1", course: "Math", students: 3, published: 1, drafts: 1, lessonsWithoutAttendance: 1 }]);
    expect([c.missingGrades, c.drafts, c.lessonsWithoutAttendance, c.ended]).toEqual([2, 1, 1, false]);
    expect(await data.getTermChecklist("nope")).toBeNull();
  });

  it("says a term that finished is ended", async () => {
    const old = await db.term.create({ data: { name: "Old", startDate: daysFromNow(-400), endDate: daysFromNow(-300) } });
    expect((await data.getTermChecklist(old.id))?.ended).toBe(true);
  });
});

describe("dashboard", () => {
  it("counts people and work, and lists the lessons that need attention", async () => {
    const w = await createWorld();
    await user("student", "Inactive", { active: false });
    const gone = await user("teacher", "Retired", { active: false });
    await user("student", "Asks", { deletionRequestedAt: new Date() });
    await lesson(w.group.id, w.teacher.id, -5); // past, nobody took attendance
    await lesson(w.group.id, w.teacher.id, 5);
    await lesson(w.group.id, gone.id, 6); // upcoming with a deactivated teacher
    await lesson(w.group.id, w.teacher.id, 7, { status: "cancelled" });
    const d = await data.getDashboard();
    expect(d.adminName).toBe("Ada Admin");
    expect(d.counts).toEqual({ courses: 1, teachers: 1, students: 2, groups: 1, upcomingLessons: 2 });
    expect(d.notMarked.total).toBe(1);
    expect(d.noTeacher.total).toBe(1);
    expect(d.noTeacher.rows[0]).toMatchObject({ teacher: "Retired", group: "A1", course: "Math" });
    expect(d.deletionRequests).toBe(1);
    expect(d.termName).toBe("Fall");
  });

  it("does not nag about unmarked lessons in a locked term", async () => {
    const w = await createWorld();
    await lesson(w.group.id, w.teacher.id, -5);
    await db.term.update({ where: { id: w.term.id }, data: { locked: true } });
    expect((await data.getDashboard()).notMarked.total).toBe(0);
  });

  it("keeps lists to eight rows while still reporting the true total", async () => {
    const w = await createWorld();
    for (let i = 1; i <= 11; i++) await lesson(w.group.id, w.teacher.id, -i * 2);
    const d = await data.getDashboard();
    expect(d.notMarked.total).toBe(11);
    expect(d.notMarked.rows).toHaveLength(8);
    expect(d.notMarked.rows[0].start).toMatch(/^\d{2}:\d{2}$/);
  });

  it("is empty and calm in a school with nothing in it", async () => {
    const d = await data.getDashboard();
    expect(d.counts).toEqual({ courses: 0, teachers: 0, students: 0, groups: 0, upcomingLessons: 0 });
    expect([d.termName, d.atRisk.total, d.todayLessons.length]).toEqual([null, 0, 0]);
  });

  it("lists students falling behind in the current term with their group", async () => {
    const w = await createWorld();
    // Two past lessons with an absence each: attendance 0%, which is below the risk line.
    for (const h of [-10, -5]) {
      const l = await lesson(w.group.id, w.teacher.id, h);
      await db.attendance.create({ data: { lessonId: l.id, studentId: w.student.id, status: "absent" } });
    }
    const d = await data.getDashboard();
    expect(d.atRisk.total).toBe(1);
    expect(d.atRisk.rows[0]).toMatchObject({ name: "Student", group: "A1", course: "Math", groupId: w.group.id });
  });
});

describe("settings", () => {
  it("returns the attendance limits and mark weights, using defaults until someone changes them", async () => {
    const s = await data.getSettings();
    expect(s.attendanceWarnBelow).toBeGreaterThan(s.attendanceRiskBelow);
    expect(s.weights).toMatchObject({ classwork: expect.any(Number), quiz: expect.any(Number), exam: expect.any(Number), homework: expect.any(Number) });
  });
});

describe("applications", () => {
  const apply = (groupId: string, extra: Record<string, unknown> = {}) =>
    db.application.create({
      data: { groupId, name: "Nigar", email: `nigar${++n}@t.local`, phone: "+994501234567", locale: "az", ipHash: "h", privacyAcceptedAt: new Date(), ...extra },
    });

  it("counts new applications only", async () => {
    const w = await createWorld();
    await apply(w.group.id);
    await apply(w.group.id, { status: "contacted" });
    expect(await data.getNewApplicationCount()).toBe(1);
  });

  it("filters by status and group, lists new ones first and oldest first within a status, and shows seats left", async () => {
    const w = await createWorld();
    const g2 = await db.group.create({ data: { name: "B2", courseId: w.course.id, teacherId: w.teacher.id, termId: w.term.id } });
    await db.group.update({ where: { id: w.group.id }, data: { capacity: 3 } });
    const old = await apply(w.group.id, { name: "Old", createdAt: new Date(Date.now() - 5 * HOUR) });
    await apply(w.group.id, { name: "Newer", createdAt: new Date(Date.now() - HOUR) });
    await apply(w.group.id, { name: "Done", status: "approved" });
    await apply(g2.id, { name: "Elsewhere" });
    const all = await data.getApplications({});
    expect(all.applications.map((a) => a.name)).toEqual(["Old", "Newer", "Elsewhere", "Done"]);
    expect(all.applications[0].group).toEqual({ id: w.group.id, name: "A1", course: "Math", seatsLeft: 2 }); // one active student of three
    expect(all.applications[2].group.seatsLeft).toBeNull(); // no limit
    expect((await data.getApplications({ status: "approved" })).applications.map((a) => a.name)).toEqual(["Done"]);
    expect((await data.getApplications({ group: g2.id })).applications.map((a) => a.name)).toEqual(["Elsewhere"]);
    expect((await data.getApplications({ status: "bogus" })).status).toBeNull();
    expect(all.groups.map((g) => g.name)).toEqual(["A1", "B2"]);
    void old;
  });

  it("never shows less than zero seats", async () => {
    const w = await createWorld();
    await db.group.update({ where: { id: w.group.id }, data: { capacity: 1 } });
    const s2 = await user("student", "Extra");
    await db.enrollment.create({ data: { groupId: w.group.id, studentId: s2.id } });
    await apply(w.group.id);
    expect((await data.getApplications({})).applications[0].group.seatsLeft).toBe(0);
  });

  it("pages in fifties and clamps the page", async () => {
    const w = await createWorld();
    await db.application.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({ groupId: w.group.id, name: `P${i}`, email: `p${i}@t.local`, phone: "1", locale: "az", ipHash: "h", privacyAcceptedAt: new Date() })),
    });
    const p2 = await data.getApplications({ page: "2" });
    expect([p2.pages, p2.applications.length, p2.total]).toEqual([2, 5, 55]);
    expect((await data.getApplications({ page: "40" })).page).toBe(2);
  });

  it("opens one application with the account its email already has, and the seats left", async () => {
    const w = await createWorld();
    const a = await apply(w.group.id, { email: "student0@test.local" });
    const none = await apply(w.group.id, { email: "brand-new@t.local" });
    const detail = (await data.getApplication(a.id))!;
    expect(detail.account).toBeNull(); // no user has this exact address
    const existing = await db.user.update({ where: { id: w.student.id }, data: { email: "student0@test.local" } });
    expect((await data.getApplication(a.id))!.account).toMatchObject({ id: existing.id, role: "student", active: true });
    expect((await data.getApplication(none.id))!.account).toBeNull();
    expect(detail.seatsLeft).toBeNull();
    expect(await data.getApplication("nope")).toBeNull();
  });
});
