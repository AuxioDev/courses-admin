# courses-admin — Admin Panel

The admin's side of the Online Courses System. It shares one database with the Student
Diary (`courses_student`) and the Teacher App (`courses_teacher`). Setting up courses,
people, groups, schedules and terms happens here, and so do final grades, locking and reports.

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS 4 · Prisma 7 +
PostgreSQL. Built for desktop.

## Setup

The Diary must be set up first, because it owns the database.

```bash
npm install
cp .env.example .env        # same DATABASE_URL and SESSION_SECRET as the Diary
npm run dev                 # http://localhost:3003
```

Demo login after seeding the Diary's database: `admin@example.com` / `password123`.
Teachers and students are refused here.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3003 |
| `npm run build` | Production build |
| `npm run typecheck` / `npm run lint` | Checks |
| `npm run sync:check` | Fails if a file shared with the Diary or Teacher App has drifted |
| `npm run admin:create -- "Name" email` | New admin with a temporary password |

## Structure

```
prisma/schema.prisma        Shared data model, copied from the Diary. Never edited here
src/proxy.ts                Language prefix and optimistic login redirect
src/lib/auth.ts             getCurrentAdmin(): verifies the session and admin role
src/lib/data.ts             Reads for the pages, each checking the admin first
src/lib/reports.ts          Report calculations, shared by the page and the CSV
src/lib/schedule-plan.ts    Compares weekly rules with existing lessons. Changes nothing
src/lib/lesson-state.ts     When a lesson can be moved, cancelled or reassigned
src/app/actions.ts          Every write: role check, validation, term lock, then the change
src/app/api/reports         CSV download
src/app/[lang]/(app)        Screens: Dashboard, Courses, Users, Groups, Schedule, Terms,
                            Reports, Settings, Profile
docs/                       Manual test checklist and deploy guide
```

## Notes

- **Migrations belong to the Diary.** This repo has no migrations folder and must never
  run `prisma migrate`. A schema change lands and deploys in the Diary first, then
  `prisma/schema.prisma` is copied here unchanged.
- **Sessions.** The cookie is `ca_session`. `SESSION_SECRET` is shared with the other apps.
- **Times.** Rules and lesson times are entered in `SCHOOL_TIMEZONE` and stored in UTC.
- **Deleting lessons.** Homework, marks and student notes are detached silently when a
  lesson is deleted, so the Panel only deletes lessons with no attendance, homework or marks.
- **Private data.** This app must never read `StudentNote` or `StudentTodo`, or show
  `SubmissionFile` rows with `attemptId = null`.
- **Never run the Diary's `db:seed` on a database worth keeping.** It wipes everything.
