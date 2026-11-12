// Fails when a file shared with the Student Diary or the Teacher App has drifted.
// Run from this repo: npm run sync:check
// Both apps are expected next to this repo; set STUDENT_REPO or TEACHER_REPO to look elsewhere.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const studentRepo = path.resolve(process.env.STUDENT_REPO ?? "../courses_student");
const teacherRepo = path.resolve(process.env.TEACHER_REPO ?? "../courses_teacher");

// Must stay byte-for-byte identical. Add a file here when it is copied in a later step.
const SOURCES = [
  {
    name: "Student Diary",
    repo: studentRepo,
    files: [
      "prisma/schema.prisma",
      "src/app/globals.css",
      "src/app/motion.css",
      "src/components/language-menu.tsx",
      "src/components/link-pending.tsx",
      "src/components/password-form.tsx",
      "src/components/not-you.tsx",
      "src/components/page-transition.tsx",
      "src/app/[lang]/login/login-form.tsx",
      "src/app/[lang]/forgot-password/forgot-form.tsx",
      "src/app/[lang]/reset-password/page.tsx",
      "src/components/submit-button.tsx",
      "src/components/password-field.tsx",
      "src/components/form-kit.tsx",
      "src/components/confirm-dialog.tsx",
      "src/components/drop-zone.tsx",
      "src/lib/form-kit.ts",
      "src/lib/use-unsaved-warning.ts",
      "src/lib/__tests__/form-kit.test.ts",
      "src/components/error-view.tsx",
      "src/components/ui.tsx",
      "src/i18n/config.ts",
      "src/i18n/format.ts",
      "src/lib/dates.ts",
      "src/lib/concurrency.ts",
      "src/lib/__tests__/concurrency.test.ts",
      "src/lib/db.ts",
      "src/lib/email.ts",
      "src/lib/grading.ts",
      "src/lib/notifications/types.ts",
      "src/lib/passwords.ts",
      "src/lib/push.ts",
      "src/lib/rate-limit.ts",
      "src/lib/session-token.ts",
      "src/lib/__tests__/passwords.test.ts",
      "src/lib/__tests__/grading.test.ts",
      "src/lib/session.ts",
      "src/lib/temp-password.ts",
      "src/lib/__tests__/temp-password.test.ts",
      "src/lib/__tests__/client-ip.test.ts",
      "src/lib/__tests__/session-token.test.ts",
      "test/db.ts",
      "test/server-only.ts",
      "vitest.config.ts",
      "vitest.integration.config.ts",
    ],
  },
  {
    name: "Teacher App",
    repo: teacherRepo,
    files: [
      "src/components/icons.tsx",
      "src/components/privacy-notice.tsx",
      "src/lib/csv.ts",
      "src/i18n/dictionaries/student-messages.ts",
      "src/instrumentation.ts",
      "src/lib/notifications/notify.ts",
      "src/lib/settings.ts",
    ],
  },
];

let failed = false;
let matched = 0;
for (const { name, repo, files } of SOURCES) {
  if (!existsSync(path.join(repo, "package.json"))) {
    console.error(`${name} not found at ${repo}.`);
    failed = true;
    continue;
  }
  const different = files.filter((file) => {
    const ours = path.resolve(file);
    const theirs = path.join(repo, file);
    return !existsSync(ours) || !existsSync(theirs) || !readFileSync(ours).equals(readFileSync(theirs));
  });
  if (different.length > 0) {
    console.error(`Out of sync with ${name} (${repo}):\n${different.map((f) => `  ${f}`).join("\n")}`);
    failed = true;
  }
  matched += files.length - different.length;
}

if (failed) process.exit(1);
console.log(`${matched} shared files match the Student Diary and Teacher App.`);
