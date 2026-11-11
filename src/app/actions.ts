"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { after } from "next/server";
import type { LessonStatus } from "@/generated/prisma/enums";
import { cookies } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { getAdminForConsent, getAdminForPasswordChange, getCurrentAdmin } from "@/lib/auth";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { hashPassword, hashToken, newPasswordSchema, verifyPassword } from "@/lib/passwords";
import { clientIp, isLoginBlocked, recordLoginAttempt } from "@/lib/rate-limit";
import { emailResetLinkTo, sendResetLink } from "@/lib/password-reset";
import { audit } from "@/lib/audit";
import { mapConcurrent, NOTIFY_CONCURRENCY } from "@/lib/concurrency";
import { isTempPasswordExpired, tempPassword, tempPasswordExpiry } from "@/lib/temp-password";
import { analyzeImport, MAX_IMPORT_CHARS, type ImportProblem } from "@/lib/student-import";
import { addDays, dayKey, isDayKey, startOfDay } from "@/lib/dates";
import { notify } from "@/lib/notifications/notify";
import { emailTeachers } from "@/lib/notifications/teacher-email";
import { findLessonOverlaps } from "@/lib/lesson-rules";
import { cancelBlock, linkBlock, moveBlock, restoreBlock, teacherBlock } from "@/lib/lesson-state";
import { buildSchedulePlan, loadScheduleGroup, type SchedulePlan } from "@/lib/schedule-plan";
import { rulesOverlap, slotInstant } from "@/lib/schedule-rules";
import { SCHOOL_TIMEZONE } from "@/lib/school";
import { getRequestLocale } from "@/i18n";
import { hasLocale, isInternalPath, LOCALE_COOKIE, localePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries/en";

// Messages are keys into the dictionary so the client can show them in the current language.
export type FormState = { error?: keyof Dictionary["errors"]; ok?: keyof Dictionary["ok"]; email?: string } | undefined;

// ---------- Auth ----------

const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) return { error: "missingCredentials", email };

  const ip = await clientIp();
  if (await isLoginBlocked(parsed.data.email, ip)) return { error: "tooManyAttempts", email };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Always run bcrypt so a missing email takes as long as a wrong password.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash);
  if (!user || !valid || !user.active) {
    await recordLoginAttempt(parsed.data.email, ip, false);
    return { error: "wrongCredentials", email };
  }
  if (isTempPasswordExpired(user)) {
    await recordLoginAttempt(parsed.data.email, ip, false);
    return { error: "tempPasswordExpired", email };
  }
  await recordLoginAttempt(parsed.data.email, ip, true);
  if (user.role !== "admin") return { error: "notAdmin", email };

  await createSession({ userId: user.id, role: user.role, v: user.sessionVersion });
  // The saved language follows the admin across devices; the first login saves
  // whatever language they are using now.
  const current = await getRequestLocale();
  const locale = hasLocale(user.locale) ? user.locale : current;
  if (!user.locale) await db.user.update({ where: { id: user.id }, data: { locale } });
  const next = formData.get("next");
  redirect(localePath(locale, user.mustChangePassword ? "/change-password" : isInternalPath(next) ? next : "/"));
}

export async function logout() {
  await deleteSession();
  redirect(localePath(await getRequestLocale(), "/login"));
}

// Bumping sessionVersion invalidates every cookie issued before now.
export async function logoutEverywhere() {
  const admin = await getCurrentAdmin();
  await db.user.update({ where: { id: admin.id }, data: { sessionVersion: { increment: 1 } } });
  await deleteSession();
  redirect(localePath(await getRequestLocale(), "/login"));
}

function readNewPassword(
  formData: FormData,
): { password: string } | { error: "passwordTooShort" | "passwordMismatch" } {
  const password = String(formData.get("newPassword") ?? "");
  if (!newPasswordSchema.safeParse(password).success) return { error: "passwordTooShort" };
  if (password !== formData.get("confirmPassword")) return { error: "passwordMismatch" };
  return { password };
}

// Sets a new password, signs out every other device and keeps this one signed in.
async function setPassword(userId: string, password: string) {
  const passwordHash = await hashPassword(password);
  const [user] = await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false, tempPasswordExpiresAt: null, sessionVersion: { increment: 1 } },
    }),
    // Any other reset link still in someone's inbox stops working.
    db.authToken.deleteMany({ where: { userId, type: "reset" } }),
  ]);
  await createSession({ userId: user.id, role: user.role, v: user.sessionVersion });
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getAdminForPasswordChange();
  const user = await db.user.findUniqueOrThrow({ where: { id: admin.id }, select: { passwordHash: true } });
  const current = String(formData.get("currentPassword") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "wrongCurrentPassword" };

  const next = readNewPassword(formData);
  if ("error" in next) return { error: next.error };
  if (next.password === current) return { error: "samePassword" };

  await setPassword(admin.id, next.password);
  if (admin.mustChangePassword) redirect(localePath(await getRequestLocale(), "/"));
  refresh();
  return { ok: "passwordChanged" };
}

const forgotSchema = z.object({ email: z.email().transform((e) => e.toLowerCase().trim()) });

// Always gives the same answer, whether or not the email is registered.
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "missingCredentials" };

  // Counted with the login attempts, so one IP can't send endless reset emails.
  const ip = await clientIp();
  const key = `reset:${parsed.data.email}`;
  if (await isLoginBlocked(key, ip)) return { error: "tooManyAttempts" };
  await recordLoginAttempt(key, ip, false);

  await sendResetLink(parsed.data.email);
  return { ok: "resetSent" };
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const tokenHash = hashToken(String(formData.get("token") ?? ""));
  const record = await db.authToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record || record.type !== "reset" || record.usedAt || record.expiresAt < new Date() || !record.user.active) {
    return { error: "resetLinkInvalid" };
  }
  if (record.user.role !== "admin") return { error: "notAdmin" };

  const next = readNewPassword(formData);
  if ("error" in next) return { error: next.error };

  // Claim the token first so the same link can't be used twice at once.
  const claimed = await db.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { error: "resetLinkInvalid" };

  await setPassword(record.userId, next.password);
  const locale = hasLocale(record.user.locale) ? record.user.locale : await getRequestLocale();
  redirect(localePath(locale, "/"));
}

// ---------- Users ----------

// The temporary password travels only in this response. It is never stored in plain text.
export type AccountState =
  | { error?: keyof Dictionary["errors"]; account?: { id: string; name: string; email: string; password: string } }
  | undefined;

const accountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  // The same rule as login, so every address saved here can sign in.
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
});

function readAccount(formData: FormData) {
  const parsed = accountSchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (parsed.success) return { data: parsed.data };
  return { error: parsed.error.issues[0].path[0] === "name" ? ("userName" as const) : ("userEmail" as const) };
}

const isEmailTaken = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// A new account always starts with a one-time password the person must replace.
async function newAccount(account: { name: string; email: string }, role: "teacher" | "student") {
  const password = tempPassword();
  return { password, data: { ...account, role, passwordHash: await hashPassword(password), mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry() } };
}

// A student who left has a row already, because the pair is unique. It comes back to life.
const enrolment = (groupId: string, studentId: string) => ({
  where: { groupId_studentId: { groupId, studentId } },
  create: { groupId, studentId },
  update: { status: "active" as const },
});

export async function createUser(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const admin = await getCurrentAdmin();
  const read = readAccount(formData);
  if (read.error) return { error: read.error };
  // Admins are only created by the bootstrap script.
  const role = formData.get("role");
  if (role !== "teacher" && role !== "student") return { error: "userRole" };

  const { password, data } = await newAccount(read.data, role);
  try {
    const user = await db.user.create({ data });
    await audit(admin.id, "user.create", user.id, { role });
    return { account: { id: user.id, name: user.name, email: user.email, password } };
  } catch (e) {
    if (isEmailTaken(e)) return { error: "emailTaken" };
    throw e;
  }
}

export async function updateUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getCurrentAdmin();
  const read = readAccount(formData);
  if (read.error) return { error: read.error };
  const id = String(formData.get("userId") ?? "");
  const user = await db.user.findUnique({ where: { id }, select: { email: true, role: true } });
  if (!user) return { error: "userNotFound" };
  // An admin's name and email are changed by that admin, never by another: an email change plus a reset
  // link would hand the account over.
  if (user.role === "admin" && id !== admin.id) return { error: "cannotChangeAdmin" };

  // The public profile is a teacher's only, and only the teacher form sends it.
  let profile = {};
  if (user.role === "teacher" && formData.has("bio")) {
    const bio = String(formData.get("bio") ?? "").trim();
    if (bio.length > 2000) return { error: "userBioTooLong" };
    profile = { bio: bio || null, showOnWebsite: formData.get("showOnWebsite") === "on" };
  }

  try {
    await db.$transaction([
      db.user.update({ where: { id }, data: { ...read.data, ...profile } }),
      // A link already sent to the old address must not keep working.
      ...(user.email !== read.data.email ? [db.authToken.deleteMany({ where: { userId: id, type: "reset" } })] : []),
    ]);
  } catch (e) {
    if (isEmailTaken(e)) return { error: "emailTaken" };
    throw e;
  }
  await audit(admin.id, "user.update", id, { emailChanged: user.email !== read.data.email });
  refresh();
  return { ok: "userSaved" };
}

// For everything an admin does to someone else's access.
async function findOtherUser(formData: FormData) {
  const admin = await getCurrentAdmin();
  const user = await db.user.findUnique({
    where: { id: String(formData.get("userId") ?? "") },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      locale: true,
      active: true,
      deletionApprovedAt: true,
      privateDataErasedAt: true,
    },
  });
  if (!user) return { error: "userNotFound" as const };
  if (user.id === admin.id) return { error: "cannotChangeSelf" as const };
  // Admins are peers: none can reset, lock out or reactivate another.
  if (user.role === "admin") return { error: "cannotChangeAdmin" as const };
  return { user, admin };
}

export async function issueTempPassword(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const found = await findOtherUser(formData);
  if (found.error) return { error: found.error };
  const { user, admin } = found;
  if (!user.active) return { error: "userInactive" };

  const password = tempPassword();
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password), mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry(), sessionVersion: { increment: 1 } },
  });
  await audit(admin.id, "user.temp_password", user.id);
  refresh();
  return { account: { id: user.id, name: user.name, email: user.email, password } };
}

export async function sendUserResetLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const found = await findOtherUser(formData);
  if (found.error) return { error: found.error };
  if (!found.user.active) return { error: "userInactive" };

  const result = await emailResetLinkTo(found.user);
  if (result === "tooMany") return { error: "tooManyLinks" };
  if (result === "notSent") return { error: "emailNotSent" };
  await audit(found.admin.id, "user.reset_link", found.user.id);
  return { ok: "linkSent" };
}

// The date starts the one-year retention clock, so it is only set by the first deactivation.
export async function deactivateUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const found = await findOtherUser(formData);
  if (found.error) return { error: found.error };
  await db.user.updateMany({
    where: { id: found.user.id, active: true },
    data: { active: false, deactivatedAt: new Date(), sessionVersion: { increment: 1 } },
  });
  await audit(found.admin.id, "user.deactivate", found.user.id);
  refresh();
  return { ok: "userDeactivated" };
}

export async function reactivateUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const found = await findOtherUser(formData);
  if (found.error) return { error: found.error };
  // Retention erases these accounts whether or not they are active.
  if (found.user.deletionApprovedAt || found.user.privateDataErasedAt) return { error: "cannotReactivate" };
  await db.user.update({ where: { id: found.user.id }, data: { active: true, deactivatedAt: null } });
  await audit(found.admin.id, "user.reactivate", found.user.id);
  refresh();
  return { ok: "userReactivated" };
}

// Final: the next retention run erases the private data. School records stay.
export async function approveDeletion(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getCurrentAdmin();
  const id = String(formData.get("userId") ?? "");
  const now = new Date();
  const user = await db.user.findUnique({ where: { id }, select: { deactivatedAt: true } });
  if (!user) return { error: "userNotFound" };
  // A student can withdraw the request at any moment, so the condition is part of the write.
  const { count } = await db.user.updateMany({
    where: { id, role: "student", deletionRequestedAt: { not: null }, deletionApprovedAt: null },
    data: {
      active: false,
      deactivatedAt: user.deactivatedAt ?? now,
      deletionApprovedAt: now,
      sessionVersion: { increment: 1 },
    },
  });
  if (count === 0) return { error: "deletionNotRequested" };
  await audit(admin.id, "user.deletion_approved", id);
  refresh();
  return { ok: "deletionApproved" };
}

// ---------- Student import ----------

export type ImportPreview = {
  rows: { line: number; name: string; email: string; group: string; exists: boolean }[];
  problems: ImportProblem[];
};
export type ImportCheckState = { error?: keyof Dictionary["errors"]; preview?: ImportPreview } | undefined;
export type ImportApplyState =
  | { error?: keyof Dictionary["errors"]; created?: { name: string; email: string; password: string }[]; skipped?: number }
  | undefined;

function readImportText(formData: FormData) {
  const text = String(formData.get("csv") ?? "");
  if (!text.trim()) return { error: "importEmpty" as const };
  if (text.length > MAX_IMPORT_CHARS) return { error: "importTooLarge" as const };
  return { text };
}

export async function checkStudentImport(_prev: ImportCheckState, formData: FormData): Promise<ImportCheckState> {
  await getCurrentAdmin();
  const read = readImportText(formData);
  if (read.error !== undefined) return { error: read.error };
  const { rows, problems } = await analyzeImport(read.text);
  return {
    preview: {
      rows: rows.map(({ line, name, email, group, exists }) => ({ line, name, email, group, exists })),
      problems,
    },
  };
}

export async function applyStudentImport(_prev: ImportApplyState, formData: FormData): Promise<ImportApplyState> {
  await getCurrentAdmin();
  const read = readImportText(formData);
  if (read.error !== undefined) return { error: read.error };
  // Checked again, because the database may have changed since the preview.
  const { rows, problems } = await analyzeImport(read.text);
  if (problems.length > 0) return { error: "importChanged" };
  const fresh = rows.filter((r) => !r.exists);
  if (fresh.length === 0) return { error: "importNothing" };

  // Hashing is slow, so it happens before the transaction opens.
  const accounts = await Promise.all(
    fresh.map(async (row) => {
      const password = tempPassword();
      return { row, password, passwordHash: await hashPassword(password) };
    }),
  );
  try {
    await db.$transaction(
      accounts.map(({ row, passwordHash }) =>
        db.user.create({
          data: {
            name: row.name,
            email: row.email,
            role: "student",
            passwordHash,
            mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry(),
            ...(row.groupId ? { enrollments: { create: { groupId: row.groupId } } } : {}),
          },
        }),
      ),
    );
  } catch (e) {
    if (isEmailTaken(e)) return { error: "importChanged" };
    throw e;
  }
  refresh();
  return {
    created: accounts.map(({ row, password }) => ({ name: row.name, email: row.email, password })),
    skipped: rows.length - fresh.length,
  };
}

// ---------- Courses ----------

const courseSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  level: z.string().trim().max(60),
});

export async function saveCourse(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const parsed = courseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    level: formData.get("level") ?? "",
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0].path[0];
    return { error: field === "title" ? "courseTitle" : field === "level" ? "courseLevelTooLong" : "courseDescriptionTooLong" };
  }
  const data = {
    title: parsed.data.title,
    description: parsed.data.description || null,
    level: parsed.data.level || null,
    showOnWebsite: formData.get("showOnWebsite") === "on",
  };

  const courseId = formData.get("courseId");
  if (typeof courseId === "string") {
    const { count } = await db.course.updateMany({ where: { id: courseId }, data });
    if (count === 0) return { error: "courseNotFound" };
  } else {
    await db.course.create({ data });
  }
  redirect(localePath(await getRequestLocale(), "/courses"));
}

// Archiving only takes the course out of the new-group picker and the default list.
// Groups already running on it carry on.
export async function setCourseArchived(formData: FormData) {
  await getCurrentAdmin();
  await db.course.updateMany({
    where: { id: String(formData.get("courseId") ?? "") },
    data: { archived: formData.get("archived") === "true" },
  });
  refresh();
}

// ---------- Groups ----------

const groupNameSchema = z.string().trim().min(1).max(100);

// Student import finds groups by name, so a name can only be used once per term.
async function isGroupNameTaken(name: string, termId: string, exceptId?: string) {
  return !!(await db.group.findFirst({
    where: { name, termId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  }));
}

const isUsableCourse = async (id: string) => !!(await db.course.findFirst({ where: { id, archived: false }, select: { id: true } }));
const isUsableTerm = async (id: string) => !!(await db.term.findFirst({ where: { id, locked: false }, select: { id: true } }));
const isUsableTeacher = async (id: string) =>
  !!(await db.user.findFirst({ where: { id, role: "teacher", active: true }, select: { id: true } }));

// An empty box means "not set": no seat limit, or no price shown.
const optionalWhole = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : null), z.number().int().min(1).max(max).nullable());
const websiteSchema = z.object({ capacity: optionalWhole(1000), monthlyPrice: optionalWhole(100_000) });

// What the public website shows about a group. Forms that don't carry these fields leave them alone.
function readWebsiteFields(formData: FormData) {
  if (!formData.has("capacity")) return { data: {} };
  const parsed = websiteSchema.safeParse({ capacity: formData.get("capacity"), monthlyPrice: formData.get("monthlyPrice") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].path[0] === "capacity" ? ("groupCapacity" as const) : ("groupPrice" as const) };
  }
  return { data: { ...parsed.data, enrollmentOpen: formData.get("enrollmentOpen") === "on" } };
}

export async function saveGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const parsedName = groupNameSchema.safeParse(formData.get("name"));
  if (!parsedName.success) return { error: "groupName" };
  const name = parsedName.data;
  const website = readWebsiteFields(formData);
  if (website.error) return { error: website.error };

  const groupId = formData.get("groupId");
  if (typeof groupId !== "string") {
    const courseId = String(formData.get("courseId") ?? "");
    const teacherId = String(formData.get("teacherId") ?? "");
    const termId = String(formData.get("termId") ?? "");
    if (!(await isUsableCourse(courseId))) return { error: "groupCourse" };
    if (!(await isUsableTeacher(teacherId))) return { error: "groupTeacher" };
    if (!(await isUsableTerm(termId))) return { error: "groupTerm" };
    if (await isGroupNameTaken(name, termId)) return { error: "groupNameTaken" };
    const group = await db.group.create({ data: { name, courseId, teacherId, termId, ...website.data } });
    redirect(localePath(await getRequestLocale(), `/groups/${group.id}`));
  }

  const group = await db.group.findUnique({
    where: { id: groupId },
    select: {
      courseId: true,
      termId: true,
      term: { select: { locked: true } },
      _count: { select: { lessons: true, homework: true, marks: true, finalGrades: true } },
    },
  });
  if (!group) return { error: "groupNotFound" };
  if (group.term.locked) return { error: "termLocked" };

  // The form leaves these out when they can't change.
  const courseId = String(formData.get("courseId") ?? group.courseId);
  const termId = String(formData.get("termId") ?? group.termId);
  if (courseId !== group.courseId || termId !== group.termId) {
    const { lessons, homework, marks, finalGrades } = group._count;
    if (lessons + homework + marks + finalGrades > 0) return { error: "groupHasHistory" };
    if (courseId !== group.courseId && !(await isUsableCourse(courseId))) return { error: "groupCourse" };
    if (termId !== group.termId && !(await isUsableTerm(termId))) return { error: "groupTerm" };
  }
  if (await isGroupNameTaken(name, termId, groupId)) return { error: "groupNameTaken" };

  await db.group.update({ where: { id: groupId }, data: { name, courseId, termId, ...website.data } });
  refresh();
  return { ok: "groupSaved" };
}

// Every write to an existing group's people starts here: the group exists and its term is open.
async function findOpenGroup(groupId: string) {
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      teacherId: true,
      capacity: true,
      course: { select: { title: true } },
      term: { select: { locked: true } },
      enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
    },
  });
  if (!group) return { error: "groupNotFound" as const };
  if (group.term.locked) return { error: "termLocked" as const };
  return { group };
}

// Marks, homework and the gradebook follow the group's teacher, and each lesson has its own.
// Future lessons move with the group; past lessons and substitutes stay as they are.
export async function changeGroupTeacher(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const found = await findOpenGroup(String(formData.get("groupId") ?? ""));
  if (found.error) return { error: found.error };
  const { group } = found;
  const teacherId = String(formData.get("teacherId") ?? "");
  if (teacherId === group.teacherId) return { error: "teacherSame" };
  if (!(await isUsableTeacher(teacherId))) return { error: "groupTeacher" };

  const now = new Date();
  const moving = {
    groupId: group.id,
    teacherId: group.teacherId,
    startsAt: { gte: now },
    status: { in: ["scheduled", "moved"] as LessonStatus[] },
  };
  const first = await db.lesson.findFirst({ where: moving, orderBy: { startsAt: "asc" }, select: { startsAt: true } });
  await db.$transaction([
    db.lesson.updateMany({ where: moving, data: { teacherId } }),
    db.group.update({ where: { id: group.id }, data: { teacherId } }),
  ]);

  if (first) {
    const payload = {
      course: group.course.title,
      change: "other" as const,
      date: dayKey(first.startsAt, SCHOOL_TIMEZONE),
    };
    const dedupeKey = `lesson_changed:group-teacher:${group.id}:${now.getTime()}`;
    notifyLessonChange(group.enrollments.map((e) => e.studentId), payload, dedupeKey);
  }
  const names = { course: group.course.title, group: group.name };
  emailTeachers([
    { teacherId, notice: { kind: "groupAssigned", ...names } },
    { teacherId: group.teacherId, notice: { kind: "groupUnassigned", ...names } },
  ]);
  refresh();
  return { ok: "teacherChanged" };
}

// Runs after the response: one notification per student would otherwise keep the admin
// waiting. One student's failure must not stop the rest.
function notifyLessonChange(
  studentIds: string[],
  payload: { course: string; change: "moved" | "cancelled" | "other"; date: string; newStartsAt?: string },
  dedupeKey: string,
) {
  after(async () => {
    const outcomes = await mapConcurrent(studentIds, NOTIFY_CONCURRENCY, (studentId) =>
      notify(studentId, "lesson_changed", payload, { dedupeKey }),
    );
    for (const o of outcomes) {
      if (o.status === "rejected") console.error(`[notify] lesson_changed failed: ${o.reason instanceof Error ? o.reason.name : "unknown"}`);
    }
  });
}

// ---------- Schedule ----------

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const rulesSchema = z
  .array(z.object({ weekday: z.number().int().min(0).max(6), startTime: timeSchema, endTime: timeSchema }))
  .max(14);

function parseMeetingUrl(value: FormDataEntryValue | null): { url: string | null } | { error: "meetingUrl" } {
  const text = String(value ?? "").trim();
  if (!text) return { url: null };
  if (text.length > 2000) return { error: "meetingUrl" };
  try {
    // Goes straight into a link in the Diary and Teacher App.
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:" ? { url: text } : { error: "meetingUrl" };
  } catch {
    return { error: "meetingUrl" };
  }
}

async function readSchedule(formData: FormData) {
  await getCurrentAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("rules") ?? "[]"));
  } catch {
    return { error: "scheduleRules" as const };
  }
  const parsed = rulesSchema.safeParse(raw);
  if (!parsed.success || parsed.data.some((r) => r.endTime <= r.startTime)) return { error: "scheduleRules" as const };
  if (rulesOverlap(parsed.data)) return { error: "scheduleOverlap" as const };

  const group = await loadScheduleGroup(String(formData.get("groupId") ?? ""));
  if (!group) return { error: "groupNotFound" as const };
  if (group.term.locked) return { error: "termLocked" as const };
  return { group, draft: parsed.data };
}

export type SchedulePreviewState =
  | { error?: keyof Dictionary["errors"]; preview?: SchedulePlan & { id: string } }
  | undefined;

export async function previewSchedule(_prev: SchedulePreviewState, formData: FormData): Promise<SchedulePreviewState> {
  const read = await readSchedule(formData);
  if ("error" in read) return { error: read.error };
  const meeting = parseMeetingUrl(formData.get("meetingUrl"));
  if ("error" in meeting) return { error: meeting.error };
  const plan = await buildSchedulePlan(read.group, read.draft);
  return { preview: { ...plan, id: randomUUID() } };
}

export type ScheduleApplyState =
  | { error?: keyof Dictionary["errors"]; applied?: { created: number; removed: number; updated: number } }
  | undefined;

export async function applySchedule(_prev: ScheduleApplyState, formData: FormData): Promise<ScheduleApplyState> {
  const read = await readSchedule(formData);
  if ("error" in read) return { error: read.error };
  const { group, draft } = read;
  const meeting = parseMeetingUrl(formData.get("meetingUrl"));
  if ("error" in meeting) return { error: meeting.error };
  const applyLink = formData.get("applyLinkToFuture") === "on";

  const chosenRemove = new Set(formData.getAll("remove").map(String));
  const plan = await buildSchedulePlan(group, draft, chosenRemove);
  const chosenCreate = new Set(formData.getAll("create").map(String));
  const chosenUpdate = new Set(formData.getAll("update").map(String));
  const create = plan.create.filter((r) => chosenCreate.has(r.id));
  const remove = plan.remove.filter((r) => chosenRemove.has(r.id));
  const update = plan.update.filter((r) => chosenUpdate.has(r.id));

  // Anything chosen that the fresh plan doesn't offer means the preview is out of date.
  if (
    create.length !== chosenCreate.size ||
    remove.length !== chosenRemove.size ||
    update.length !== chosenUpdate.size ||
    create.some((r) => r.clash) ||
    update.some((r) => r.clash)
  ) {
    return { error: "scheduleChanged" };
  }
  if (create.length > 0 && !group.teacher.active) return { error: "groupTeacher" };

  const now = new Date();
  const hadUpcoming = await db.lesson.count({
    where: { groupId: group.id, startsAt: { gt: now }, status: { not: "cancelled" } },
  });
  const removeIds = remove.map((r) => r.id);
  await db.$transaction([
    ...(plan.rulesChanged
      ? [
          db.scheduleRule.deleteMany({ where: { groupId: group.id } }),
          db.scheduleRule.createMany({ data: draft.map((rule) => ({ ...rule, groupId: group.id })) }),
        ]
      : []),
    // Deleting a lesson silently detaches its homework and marks, so the check is part of the delete.
    db.lesson.deleteMany({
      where: {
        id: { in: removeIds },
        status: "scheduled",
        attendance: { none: {} },
        homework: { none: {} },
        marks: { none: {} },
      },
    }),
    db.lesson.createMany({
      data: create.map((r) => ({
        groupId: group.id,
        teacherId: group.teacherId,
        startsAt: new Date(r.id),
        endsAt: slotInstant(r.day, r.end, SCHOOL_TIMEZONE),
        meetingUrl: meeting.url,
      })),
    }),
    ...update.map((r) =>
      db.lesson.updateMany({
        where: { id: r.id, status: "scheduled" },
        data: { endsAt: slotInstant(r.day, r.newEnd, SCHOOL_TIMEZONE) },
      }),
    ),
    ...(applyLink
      ? [
          db.lesson.updateMany({
            where: { groupId: group.id, startsAt: { gt: now }, status: { in: ["scheduled", "moved"] } },
            data: { meetingUrl: meeting.url },
          }),
        ]
      : []),
  ]);

  // The first timetable of a new group isn't news. A change to a running one is, once per
  // student, dated at the first lesson it touches.
  const changedDays = [...create, ...remove, ...update].map((r) => r.day).sort();
  if (changedDays.length > 0 && (remove.length > 0 || update.length > 0 || hadUpcoming > 0)) {
    notifyLessonChange(
      group.enrollments.map((e) => e.studentId),
      { course: group.course.title, change: "other", date: changedDays[0] },
      `lesson_changed:schedule:${group.id}:${now.getTime()}`,
    );
    emailTeachers([
      {
        teacherId: group.teacherId,
        notice: { kind: "schedule", course: group.course.title, group: group.name, day: changedDays[0] },
      },
    ]);
  }
  refresh();
  return { applied: { created: create.length, removed: remove.length, updated: update.length } };
}

// ---------- Lessons ----------

const clashError = { group: "lessonClashGroup", teacher: "lessonClashTeacher" } as const;

// Every lesson write starts here.
async function loadLesson(formData: FormData) {
  await getCurrentAdmin();
  const lesson = await db.lesson.findUnique({
    where: { id: String(formData.get("lessonId") ?? "") },
    select: {
      id: true,
      groupId: true,
      teacherId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      group: {
        select: {
          name: true,
          course: { select: { title: true } },
          term: { select: { startDate: true, endDate: true, locked: true } },
          enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
        },
      },
      _count: { select: { attendance: true } },
    },
  });
  if (!lesson) return { error: "lessonNotFound" as const };
  return {
    lesson,
    state: {
      status: lesson.status,
      startsAt: lesson.startsAt,
      attendance: lesson._count.attendance,
      termLocked: lesson.group.term.locked,
    },
  };
}

type LoadedLesson = Extract<Awaited<ReturnType<typeof loadLesson>>, { lesson: unknown }>["lesson"];

const termDayOf = (date: Date) => date.toISOString().slice(0, 10);

// A local date and two times, checked against the term and the clock.
function readSlot(formData: FormData, term: { startDate: Date; endDate: Date }, now: Date) {
  const date = formData.get("date");
  const startTime = timeSchema.safeParse(formData.get("start"));
  const endTime = timeSchema.safeParse(formData.get("end"));
  if (!isRealDay(date) || !startTime.success || !endTime.success || endTime.data <= startTime.data) {
    return { error: "lessonTimes" as const };
  }
  if (date < termDayOf(term.startDate) || date > termDayOf(term.endDate)) return { error: "lessonOutsideTerm" as const };
  const start = slotInstant(date, startTime.data, SCHOOL_TIMEZONE);
  if (start <= now) return { error: "lessonInPast" as const };
  return { start, end: slotInstant(date, endTime.data, SCHOOL_TIMEZONE) };
}

function tellStudents(lesson: LoadedLesson, change: "moved" | "cancelled" | "other", at: Date, newStartsAt?: Date) {
  notifyLessonChange(
    lesson.group.enrollments.map((e) => e.studentId),
    {
      course: lesson.group.course.title,
      change,
      date: dayKey(at, SCHOOL_TIMEZONE),
      ...(newStartsAt ? { newStartsAt: newStartsAt.toISOString() } : {}),
    },
    // The time keeps a later move back to the same slot from counting as a duplicate.
    `lesson_changed:${lesson.id}:${change}:${Date.now()}`,
  );
}

const lessonNames = (lesson: LoadedLesson) => ({ course: lesson.group.course.title, group: lesson.group.name });

export async function createLesson(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const group = await db.group.findUnique({
    where: { id: String(formData.get("groupId") ?? "") },
    select: {
      id: true,
      name: true,
      teacherId: true,
      teacher: { select: { active: true } },
      course: { select: { title: true } },
      term: { select: { startDate: true, endDate: true, locked: true } },
      enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
    },
  });
  if (!group) return { error: "groupNotFound" };
  if (group.term.locked) return { error: "termLocked" };
  if (!group.teacher.active) return { error: "groupTeacher" };
  const slot = readSlot(formData, group.term, new Date());
  if ("error" in slot) return { error: slot.error };
  const meeting = parseMeetingUrl(formData.get("meetingUrl"));
  if ("error" in meeting) return { error: meeting.error };
  const { clash } = await findLessonOverlaps({ groupId: group.id, teacherId: group.teacherId, ...slot });
  if (clash) return { error: clashError[clash] };

  const lesson = await db.lesson.create({
    data: {
      groupId: group.id,
      teacherId: group.teacherId,
      startsAt: slot.start,
      endsAt: slot.end,
      meetingUrl: meeting.url,
    },
  });
  notifyLessonChange(
    group.enrollments.map((e) => e.studentId),
    { course: group.course.title, change: "other", date: dayKey(slot.start, SCHOOL_TIMEZONE) },
    `lesson_changed:${lesson.id}:other:${Date.now()}`,
  );
  emailTeachers([
    {
      teacherId: group.teacherId,
      notice: { kind: "added", course: group.course.title, group: group.name, at: slot.start },
    },
  ]);
  redirect(localePath(await getRequestLocale(), `/lessons/${lesson.id}`));
}

export async function moveLesson(_prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadLesson(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { lesson, state } = loaded;
  const block = moveBlock(state);
  if (block) return { error: block };
  const slot = readSlot(formData, lesson.group.term, new Date());
  if ("error" in slot) return { error: slot.error };
  if (slot.start.getTime() === lesson.startsAt.getTime() && slot.end.getTime() === lesson.endsAt.getTime()) {
    return { error: "lessonSameTime" };
  }
  const { clash } = await findLessonOverlaps({
    groupId: lesson.groupId,
    teacherId: lesson.teacherId,
    excludeId: lesson.id,
    ...slot,
  });
  if (clash) return { error: clashError[clash] };

  // Attendance could arrive from the Teacher App at this very moment.
  const { count } = await db.lesson.updateMany({
    where: { id: lesson.id, status: { in: ["scheduled", "moved"] }, attendance: { none: {} } },
    data: { startsAt: slot.start, endsAt: slot.end, status: "moved" },
  });
  if (count === 0) return { error: "lessonHasAttendance" };
  tellStudents(lesson, "moved", lesson.startsAt, slot.start);
  emailTeachers([
    { teacherId: lesson.teacherId, notice: { kind: "moved", ...lessonNames(lesson), at: lesson.startsAt, newAt: slot.start } },
  ]);
  refresh();
  return { ok: "lessonMoved" };
}

export async function cancelLesson(_prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadLesson(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { lesson, state } = loaded;
  const block = cancelBlock(state);
  if (block) return { error: block };

  const { count } = await db.lesson.updateMany({
    where: { id: lesson.id, status: { in: ["scheduled", "moved"] }, attendance: { none: {} } },
    data: { status: "cancelled" },
  });
  if (count === 0) return { error: "lessonHasAttendance" };
  // Nobody needs telling that a lesson in the past won't happen.
  if (lesson.startsAt > new Date()) {
    tellStudents(lesson, "cancelled", lesson.startsAt);
    emailTeachers([{ teacherId: lesson.teacherId, notice: { kind: "cancelled", ...lessonNames(lesson), at: lesson.startsAt } }]);
  }
  refresh();
  return { ok: "lessonCancelled" };
}

export async function restoreLesson(_prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadLesson(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { lesson, state } = loaded;
  if (lesson.status !== "cancelled") return { error: "lessonNotCancelled" };
  const block = restoreBlock(state, new Date());
  if (block) return { error: block };
  const { clash } = await findLessonOverlaps({
    groupId: lesson.groupId,
    teacherId: lesson.teacherId,
    excludeId: lesson.id,
    start: lesson.startsAt,
    end: lesson.endsAt,
  });
  if (clash) return { error: clashError[clash] };

  await db.lesson.update({ where: { id: lesson.id }, data: { status: "scheduled" } });
  tellStudents(lesson, "other", lesson.startsAt);
  emailTeachers([{ teacherId: lesson.teacherId, notice: { kind: "restored", ...lessonNames(lesson), at: lesson.startsAt } }]);
  refresh();
  return { ok: "lessonRestored" };
}

// A different teacher here is a substitute: attendance and topic only.
export async function changeLessonTeacher(_prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadLesson(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { lesson, state } = loaded;
  const block = teacherBlock(state, new Date());
  if (block) return { error: block };
  const teacherId = String(formData.get("teacherId") ?? "");
  if (teacherId === lesson.teacherId) return { error: "teacherSame" };
  if (!(await isUsableTeacher(teacherId))) return { error: "groupTeacher" };
  const { clash } = await findLessonOverlaps({
    groupId: lesson.groupId,
    teacherId,
    excludeId: lesson.id,
    start: lesson.startsAt,
    end: lesson.endsAt,
  });
  if (clash) return { error: clashError[clash] };

  await db.lesson.update({ where: { id: lesson.id }, data: { teacherId } });
  tellStudents(lesson, "other", lesson.startsAt);
  const names = lessonNames(lesson);
  emailTeachers([
    { teacherId, notice: { kind: "assigned", ...names, at: lesson.startsAt } },
    { teacherId: lesson.teacherId, notice: { kind: "unassigned", ...names, at: lesson.startsAt } },
  ]);
  refresh();
  return { ok: "lessonTeacherChanged" };
}

export async function setLessonLink(_prev: FormState, formData: FormData): Promise<FormState> {
  const loaded = await loadLesson(formData);
  if ("error" in loaded) return { error: loaded.error };
  const block = linkBlock(loaded.state);
  if (block) return { error: block };
  const meeting = parseMeetingUrl(formData.get("meetingUrl"));
  if ("error" in meeting) return { error: meeting.error };
  await db.lesson.update({ where: { id: loaded.lesson.id }, data: { meetingUrl: meeting.url } });
  refresh();
  return { ok: "lessonLinkSaved" };
}

export async function enrolStudents(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const found = await findOpenGroup(String(formData.get("groupId") ?? ""));
  if (found.error) return { error: found.error };
  const groupId = found.group.id;
  const ids = [...new Set(formData.getAll("studentId").map(String))];
  if (ids.length === 0) return { error: "noStudentsChosen" };

  const students = await db.user.findMany({
    where: { id: { in: ids }, role: "student", active: true },
    select: { id: true },
  });
  if (students.length !== ids.length) return { error: "studentInactive" };

  await db.$transaction(students.map(({ id: studentId }) => db.enrollment.upsert(enrolment(groupId, studentId))));
  refresh();
  return { ok: "studentsEnrolled" };
}

// ---------- Applications (sent from the public website) ----------

const OPEN_APPLICATION = ["new", "contacted"] as const;

export async function setApplicationStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getCurrentAdmin();
  const status = formData.get("status");
  if (status !== "contacted" && status !== "rejected") return { error: "applicationStatus" };
  // Approved and rejected are final: an approval has already created an enrolment.
  const { count } = await db.application.updateMany({
    where: { id: String(formData.get("applicationId") ?? ""), status: { in: [...OPEN_APPLICATION] } },
    data: status === "rejected" ? { status, handledAt: new Date(), handledBy: admin.id } : { status },
  });
  if (count === 0) return { error: "applicationHandled" };
  const applicationId = String(formData.get("applicationId") ?? "");
  await audit(admin.id, status === "rejected" ? "application.reject" : "application.contacted", applicationId);
  refresh();
  return { ok: status === "rejected" ? "applicationRejected" : "applicationContacted" };
}

// The temporary password of a newly created student travels only in this response.
export type ApprovalState =
  | { error?: keyof Dictionary["errors"]; approved?: { studentId: string; name: string; email: string; password?: string } }
  | undefined;

class ApplicationTaken extends Error {}
class GroupIsFull extends Error {}

// One step: the student account (new, or the one that already has this email) and the enrolment.
export async function approveApplication(_prev: ApprovalState, formData: FormData): Promise<ApprovalState> {
  const admin = await getCurrentAdmin();
  const application = await db.application.findUnique({
    where: { id: String(formData.get("applicationId") ?? "") },
    select: { id: true, status: true, name: true, email: true, groupId: true },
  });
  if (!application) return { error: "applicationNotFound" };
  if (application.status === "approved" || application.status === "rejected") return { error: "applicationHandled" };

  const found = await findOpenGroup(application.groupId);
  if (found.error) return { error: found.error };
  const { group } = found;

  const existing = await db.user.findUnique({
    where: { email: application.email },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  // A teacher's or admin's address, or a closed account: the office has to sort that out by hand.
  if (existing && (existing.role !== "student" || !existing.active)) return { error: "applicationEmailInUse" };

  const alreadyIn = !!existing && group.enrollments.some((e) => e.studentId === existing.id);
  if (!alreadyIn && group.capacity !== null && group.enrollments.length >= group.capacity) return { error: "groupFull" };

  const created = existing ? null : await newAccount({ name: application.name.slice(0, 100), email: application.email }, "student");
  try {
    const student = await db.$transaction(async (tx) => {
      // Two admins pressing Approve at once: only the first one gets through.
      const { count } = await tx.application.updateMany({
        where: { id: application.id, status: { in: [...OPEN_APPLICATION] } },
        data: { status: "approved", handledAt: new Date(), handledBy: admin.id },
      });
      if (count === 0) throw new ApplicationTaken();
      // The check above the transaction is only a quick answer. Two admins approving different applications
      // for the last seat would both pass it, so lock the group, count again and only then enrol.
      await tx.$queryRaw`SELECT id FROM groups WHERE id = ${group.id} FOR UPDATE`;
      const seated = await tx.enrollment.count({ where: { groupId: group.id, status: "active", student: { active: true } } });
      const already = existing
        ? (await tx.enrollment.count({ where: { groupId: group.id, studentId: existing.id, status: "active" } })) > 0
        : false;
      if (!already && group.capacity !== null && seated >= group.capacity) throw new GroupIsFull();
      const user = existing ?? (await tx.user.create({ data: created!.data, select: { id: true, name: true, email: true } }));
      await tx.enrollment.upsert(enrolment(group.id, user.id));
      await tx.application.update({ where: { id: application.id }, data: { studentId: user.id } });
      return user;
    });
    await audit(admin.id, "application.approve", application.id, { newAccount: !existing });
    // No refresh(): it would re-render the page with the application already approved and unmount the
    // card that shows the new student's one-time password, which exists nowhere else (createUser does the same).
    return { approved: { studentId: student.id, name: student.name, email: student.email, password: created?.password } };
  } catch (e) {
    if (e instanceof ApplicationTaken) return { error: "applicationHandled" };
    if (e instanceof GroupIsFull) return { error: "groupFull" };
    // Someone created an account with this email a moment ago: approving again will reuse it.
    if (isEmailTaken(e)) return { error: "emailTaken" };
    throw e;
  }
}

// Attendance, marks and submissions stay. The student just leaves the roster.
export async function setEnrollmentStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const status = formData.get("status");
  if (status !== "active" && status !== "dropped") return { error: "enrollmentNotFound" };
  const enrollment = await db.enrollment.findUnique({
    where: { id: String(formData.get("enrollmentId") ?? "") },
    select: { id: true, group: { select: { term: { select: { locked: true } } } }, student: { select: { active: true } } },
  });
  if (!enrollment) return { error: "enrollmentNotFound" };
  if (enrollment.group.term.locked) return { error: "termLocked" };
  if (status === "active" && !enrollment.student.active) return { error: "studentInactive" };

  await db.enrollment.update({ where: { id: enrollment.id }, data: { status } });
  refresh();
  return { ok: status === "active" ? "studentReenrolled" : "studentDropped" };
}

// ---------- Terms ----------

const MAX_TERM_DAYS = 366;

// isDayKey alone lets impossible days like 02-31 through; addDays rolls them over.
const isRealDay = (value: unknown): value is string => isDayKey(value) && addDays(value, 0) === value;

export async function saveTerm(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name || name.length > 100) return { error: "termName" };
  const startKey = formData.get("startDate");
  const endKey = formData.get("endDate");
  if (!isRealDay(startKey) || !isRealDay(endKey) || endKey <= startKey) return { error: "termDates" };
  // Lessons are generated across the whole term, so a mistyped year would create hundreds.
  if (endKey > addDays(startKey, MAX_TERM_DAYS)) return { error: "termTooLong" };
  const data = {
    name,
    startDate: new Date(`${startKey}T00:00:00Z`),
    endDate: new Date(`${endKey}T00:00:00Z`),
  };

  const termId = formData.get("termId");
  if (typeof termId === "string") {
    const term = await db.term.findUnique({ where: { id: termId }, select: { locked: true } });
    if (!term) return { error: "termNotFound" };
    if (term.locked) return { error: "termLocked" };
    // The Diary and Teacher App list lessons by term, so none may be left outside it.
    const stranded = await db.lesson.findFirst({
      where: {
        group: { termId },
        status: { not: "cancelled" },
        OR: [
          { startsAt: { lt: startOfDay(startKey, SCHOOL_TIMEZONE) } },
          { startsAt: { gte: startOfDay(addDays(endKey, 1), SCHOOL_TIMEZONE) } },
        ],
      },
      select: { id: true },
    });
    if (stranded) return { error: "termLessonsOutside" };
    await db.term.update({ where: { id: termId }, data });
  } else {
    await db.term.create({ data });
  }
  redirect(localePath(await getRequestLocale(), "/terms"));
}

// ---------- Final grades and locking ----------

// Saves what is typed, then publishes or unpublishes. Students only ever see published grades.
export async function saveFinalGrades(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const intent = formData.get("intent");
  if (intent !== "save" && intent !== "publish" && intent !== "unpublish") return { error: "finalValue" };
  const group = await db.group.findUnique({
    where: { id: String(formData.get("groupId") ?? "") },
    select: {
      id: true,
      termId: true,
      term: { select: { locked: true } },
      enrollments: { where: { status: "active", student: { active: true } }, select: { studentId: true } },
      finalGrades: { select: { studentId: true } },
    },
  });
  if (!group) return { error: "groupNotFound" };
  if (group.term.locked) return { error: "termLocked" };
  const where = { groupId: group.id, termId: group.termId };

  if (intent === "unpublish") {
    await db.finalGrade.updateMany({ where, data: { published: false } });
    refresh();
    return { ok: "gradesUnpublished" };
  }

  const eligible = new Set([...group.enrollments, ...group.finalGrades].map((row) => row.studentId));
  const values: { studentId: string; value: number }[] = [];
  const blanks: string[] = [];
  for (const studentId of eligible) {
    const raw = formData.get(`value:${studentId}`);
    if (raw === null) continue;
    const text = String(raw).trim();
    if (text === "") {
      blanks.push(studentId);
      continue;
    }
    const value = Number(text);
    if (!Number.isFinite(value) || value < 0 || value > 100) return { error: "finalValue" };
    values.push({ studentId, value: Math.round(value * 10) / 10 });
  }
  if (intent === "publish" && values.length === 0) return { error: "finalNone" };

  await db.$transaction([
    db.finalGrade.deleteMany({ where: { ...where, studentId: { in: blanks } } }),
    ...values.map(({ studentId, value }) =>
      db.finalGrade.upsert({
        where: { studentId_groupId_termId: { studentId, groupId: group.id, termId: group.termId } },
        create: { studentId, groupId: group.id, termId: group.termId, value },
        update: { value },
      }),
    ),
    ...(intent === "publish" ? [db.finalGrade.updateMany({ where, data: { published: true } })] : []),
  ]);
  refresh();
  return { ok: intent === "publish" ? "gradesPublished" : "gradesSaved" };
}

// Locking makes the term read-only in all three apps. It can be undone.
export async function setTermLocked(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getCurrentAdmin();
  const locked = formData.get("locked") === "true";
  const { count } = await db.term.updateMany({
    where: { id: String(formData.get("termId") ?? "") },
    data: { locked },
  });
  if (count === 0) return { error: "termNotFound" };
  await audit(admin.id, locked ? "term.lock" : "term.unlock", String(formData.get("termId") ?? ""));
  refresh();
  return { ok: locked ? "termClosed" : "termReopened" };
}

// ---------- Settings ----------

const MARK_TYPES = ["classwork", "quiz", "exam", "homework"] as const;

export async function saveSettings(_prev: FormState, formData: FormData): Promise<FormState> {
  await getCurrentAdmin();
  const read = (name: string) => {
    const raw = String(formData.get(name) ?? "").trim();
    return raw === "" ? Number.NaN : Number(raw);
  };
  const attendanceWarnBelow = read("attendanceWarnBelow");
  const attendanceRiskBelow = read("attendanceRiskBelow");
  const isPercent = (n: number) => Number.isInteger(n) && n >= 0 && n <= 100;
  if (!isPercent(attendanceWarnBelow) || !isPercent(attendanceRiskBelow)) return { error: "settingsPercent" };
  if (attendanceRiskBelow >= attendanceWarnBelow) return { error: "settingsOrder" };

  const markWeights = Object.fromEntries(MARK_TYPES.map((type) => [type, read(`weight:${type}`)]));
  // The same range the Teacher App accepts when a mark is given.
  if (Object.values(markWeights).some((w) => !Number.isFinite(w) || w < 0.1 || w > 10)) {
    return { error: "settingsWeight" };
  }

  const data = { attendanceWarnBelow, attendanceRiskBelow, markWeights };
  await db.schoolSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
  refresh();
  return { ok: "settingsSaved" };
}

// ---------- Profile ----------

export async function updateTimezone(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await getCurrentAdmin();
  const timezone = String(formData.get("timezone") ?? "");
  if (!Intl.supportedValuesOf("timeZone").includes(timezone) && timezone !== "UTC") {
    return { error: "badTimezone" };
  }
  await db.user.update({ where: { id: admin.id }, data: { timezone } });
  refresh();
  return { ok: "timezoneSaved" };
}

export async function updateLocale(formData: FormData) {
  const admin = await getCurrentAdmin();
  const locale = formData.get("locale");
  if (!hasLocale(locale)) return;
  await db.user.update({ where: { id: admin.id }, data: { locale } });
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Stay on the same page. Only paths inside this site are accepted.
  const path = formData.get("path");
  redirect(localePath(locale, isInternalPath(path) ? path : "/"));
}

export async function acceptPrivacy(formData: FormData) {
  const admin = await getAdminForConsent();
  if (formData.get("confirmResponsible") !== "on") return;
  await db.user.update({
    where: { id: admin.id },
    data: { privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: new Date() },
  });
  redirect(localePath(await getRequestLocale(), "/"));
}
