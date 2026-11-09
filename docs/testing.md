# Testing the Admin Panel

| Command | What it runs | Needs |
|---|---|---|
| `npm test` | 101 unit tests (Vitest): pure logic, security helpers, translations, colour contrast | nothing |
| `npm run test:integration` | 46 integration tests against a real Postgres, calling the real server actions | `TEST_DATABASE_URL` |
| `npm run test:watch` | unit tests, re-run on save | nothing |

## Integration tests use a throwaway database
They `TRUNCATE` every table. The three apps share one real database, so the helper in
`test/db.ts` **refuses to run unless the database name ends in `_test`** (verified: it refuses `courses_student`).

```bash
createdb courses_test
# Only the Student Diary has migrations; Teacher and Admin can use `npx prisma db push` instead:
URL=postgresql://localhost:5432/courses_test
# Set both: the migration config prefers DATABASE_URL_UNPOOLED if your .env defines it.
DATABASE_URL=$URL DATABASE_URL_UNPOOLED=$URL npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://localhost:5432/courses_test npm run test:integration
```

CI does the same on a Postgres service container (`.github/workflows/ci.yml`).

## What is covered
- **Sessions and passwords:** signing, expiry, tampering, `alg: none`, wrong secret, weak secret, bcrypt, token hashing.
- **Login rate limit** (real database): 5 failures per email, 100 per IP, 15-minute window, resets separate from logins.
- **Dates:** Asia/Baku days, DST, week and month arithmetic.
- **Marks and grading:** weighted average, bands, attendance rate and levels, the unique mark per homework.
- **Translations:** az, en and ru have identical keys, no empty strings, identical `{placeholders}`.
- **Colour contrast:** every text, button and focus colour meets WCAG AA in light and dark (reads the real CSS).
- **Authorization matrix:** every exported action except the public ones rejects a request that is not a signed-in admin, and writes nothing. A new action without a guard fails the test.
- **Schedule:** lessons generated per rule per week, idempotent, teacher and group clashes, back-to-back is fine, cancelled lessons ignored, removing a rule keeps lessons with attendance, homework or marks.
- **Student import:** semicolon files, BOM, duplicates, unknown / ambiguous / locked-term groups, 100-row limit, all-or-nothing apply.
- **Terms and grades:** impossible dates, shrinking past existing lessons, locked terms read-only, publish / unpublish.
- **Users:** deactivation signs out everywhere and keeps the first date, deletion approval, no admin creation from the panel.
- **CSV:** formula injection, quoting, BOM.
