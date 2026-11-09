# Deploying the Admin Panel

The Admin Panel is a separate Vercel project that uses the **same** Neon database as the
Student Diary and Teacher App. It has no database migrations, no cron jobs and no file storage.

Do these in order. The Diary goes first, because it owns the database.

## 1. Deploy the other two apps first

In `courses_student`, commit and push the waiting changes, including
`prisma/migrations/20261109120000_mark_unique_homework/` and the fix in
`src/lib/notifications/types.ts`. Wait for the production deployment to finish. Its build
applies the migration.

Then commit, push and deploy `courses_teacher`, following its own deploy guide. It needs the
same `types.ts` change.

## 2. Push the code

Before pushing, with all three repos side by side, confirm the shared files match:

```bash
npm run sync:check
```

Commit and push `courses-admin`.

## 3. Create the Vercel project

1. **Add New → Project**, and import `AuxioDev/courses-admin`.
2. Keep the defaults, but **don't deploy yet** if Vercel lets you skip it. If it deploys
   anyway, that first build may fail, which is harmless.
3. Check that the region is `fra1`. `vercel.json` sets it.

## 4. Connect the existing database

In the project's **Storage** tab, connect the Neon database the Diary uses. **Don't create a
new one.** Check that `DATABASE_URL` appears in **Settings → Environment Variables**.

The Blob store isn't needed here.

## 5. Add the environment variables

Mark the secrets as **Sensitive**. Copy the shared values from the Diary project.

| Name | Value | Sensitive |
| --- | --- | --- |
| `SESSION_SECRET` | Same as the Diary | Yes |
| `APP_URL` | This app's address, e.g. `https://courses-admin.vercel.app` | No |
| `STUDENT_APP_URL` | The Diary's address | No |
| `TEACHER_APP_URL` | The Teacher App's address | No |
| `SCHOOL_TIMEZONE` | `Asia/Baku` | No |
| `RESEND_API_KEY` | Same as the Diary | Yes |
| `EMAIL_FROM` | Same as the Diary | No |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same as the Diary | No |
| `VAPID_PRIVATE_KEY` | Same as the Diary | Yes |
| `VAPID_SUBJECT` | Same as the Diary | No |
| `PRIVACY_CONTACT_EMAIL` | Who to contact about data | No |

`STUDENT_APP_URL` and `TEACHER_APP_URL` are required on Vercel. Without them, notifications
and reset links for students and teachers fail.

## 6. Deploy

Under **Deployments**, redeploy the latest one. Check that `APP_URL` matches the address
you got. If it doesn't, fix it and redeploy.

## 7. Create the first admin

The script runs on your computer against the production database. Use the direct connection
string:

```bash
DATABASE_URL="direct-url" npm run admin:create -- "Full Name" admin@school.az
```

The temporary password is printed once. Never run the Diary's `db:seed` here: it wipes the
shared database.

## 8. Test it

Go through [the checklist](manual-test-checklist.md), paying particular attention to the
parts that can only be checked on a real address:

- A reset link reaching a real inbox and opening the right app, for a student and a teacher
- A "lesson moved" email reaching a student, with a link that opens the **Diary**
- A schedule-change email reaching a teacher, with a link that opens the **Teacher App**
- A push notification reaching a student's phone
- A CSV download opening in Excel

## Setting up the school

In this order, because each step needs the one before:

1. **Terms**: the term's first and last day.
2. **Courses**.
3. **Users**: add the teachers, then import the students by CSV.
4. **Groups**: course, teacher and term. Then add the students.
5. **Weekly schedule** on each group: preview, then apply. Add the meeting link here.
6. **Settings**: check the attendance limits and mark weights.

Hand over the temporary passwords in person or over a private channel.

## Before a real pilot

- [ ] A new, empty database with no demo accounts. The Diary's migrations create its tables
- [ ] A verified sending domain in Resend, and `EMAIL_FROM` set in all three projects
- [ ] The admin privacy notice reviewed
- [ ] Azerbaijani and Russian text checked by a native speaker
- [ ] A decision on the Vercel plan: Hobby is for non-commercial use only
