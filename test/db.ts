// Helpers for integration tests. They TRUNCATE tables, so they refuse to run against anything
// that isn't clearly a throwaway database (name ends in "_test"). The real database is shared by
// all three apps: never point TEST_DATABASE_URL at it.
import { db } from "@/lib/db";

export function assertTestDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("Set TEST_DATABASE_URL to a throwaway database whose name ends in _test.");
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/_test$/.test(name)) {
    throw new Error(`Refusing to run integration tests on database "${name}": the name must end in "_test".`);
  }
}

export async function resetDatabase() {
  assertTestDatabase();
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;
const next = () => ++counter;

// A midnight (UTC) date, n days from today. Fixtures are relative to now, never to a calendar date: a term that
// "ends on 31 December" or a deadline "on the 20th" silently turns into a past one, and tests that expect a current
// term or an on-time hand-in start failing on a day nobody changed anything.
export const daysFromNow = (n: number) => new Date(`${new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`);

// A teacher, a student, and a group with one homework: the smallest world most tests need.
export async function createWorld() {
  const n = next();
  const teacher = await db.user.create({
    data: { name: "Teacher", email: `teacher${n}@test.local`, passwordHash: "x", role: "teacher" },
  });
  const student = await db.user.create({
    data: { name: "Student", email: `student${n}@test.local`, passwordHash: "x", role: "student" },
  });
  const course = await db.course.create({ data: { title: "Math" } });
  const term = await db.term.create({
    data: { name: "Fall", startDate: daysFromNow(-70), endDate: daysFromNow(60) },
  });
  const group = await db.group.create({
    data: { name: "A1", courseId: course.id, teacherId: teacher.id, termId: term.id },
  });
  await db.enrollment.create({ data: { groupId: group.id, studentId: student.id } });
  const homework = await db.homework.create({
    data: { groupId: group.id, title: "HW 1", dueAt: new Date(Date.now() + 14 * 86_400_000), maxScore: 20 },
  });
  return { teacher, student, course, term, group, homework };
}
