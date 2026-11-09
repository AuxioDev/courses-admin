# Admin Panel: manual test checklist

Run this before each release, on desktop Chrome. Keep the Student Diary and Teacher App open
beside it, because most of what the admin does is only finished when a teacher or student can
see it.

Seed the Diary's **local** database first, from `courses_student`:

```bash
npm run db:seed
```

This wipes that database. Never run it against one with real data.

| Account (password `password123`) | Use |
| --- | --- |
| `admin@example.com` | The admin |
| `leyla@example.com`, `tural@example.com` | Teachers. Must be refused here |
| `student@example.com`, `murad@example.com`, `nigar@example.com` | Students. Must be refused here |

Emails are written to `.emails/` in development. Confirmation dialogs are part of each action.

## 1. Signing in

- [ ] A teacher and a student are refused with the "this app is for school admins" message
- [ ] A wrong password shows an error, and 5 wrong tries block login for 15 minutes
- [ ] A new admin (`npm run admin:create`) must choose a password, then accept the privacy notice
- [ ] Forgot password sends a link that works once and opens this app
- [ ] Log out on all devices signs out other browsers
- [ ] Logging in to the Diary or Teacher App in the same browser doesn't sign the admin out
- [ ] Logged out, every page goes to login and returns to the page you wanted

## 2. Courses and terms

- [ ] A course can be created, edited, archived and restored
- [ ] An archived course leaves the default list and the new-group form
- [ ] A term with the end before the start, or longer than a year, is refused
- [ ] Shortening a term so that a lesson falls outside it is refused
- [ ] Overlapping terms both show a warning
- [ ] A locked term opens read-only

## 3. Users

- [ ] A new teacher and a new student get a temporary password shown once
- [ ] Each can log in to their own app, and must change the password
- [ ] A duplicate email is refused, with the typed text kept
- [ ] CSV import reports every bad line and creates nothing until the list is clean
- [ ] CSV import with semicolons and az/ru names works, and the password file opens correctly in Excel
- [ ] A new temporary password signs the person out
- [ ] A reset link opens the person's own app, in their language
- [ ] Changing an email cancels links already sent
- [ ] Deactivating signs the person out at their next page load, and warns about a teacher's upcoming lessons
- [ ] Reactivating lets them back in
- [ ] A deletion request shows the banner. Approving deactivates the student, and the account can't be reactivated
- [ ] Your own account has no deactivate or password buttons

## 4. Groups

- [ ] A new group appears in the teacher's My groups and the student's term switcher
- [ ] Two groups in one term can't share a name
- [ ] Course and term are fixed once a group has lessons, homework or marks
- [ ] Students can be added, removed and added back, and history is kept
- [ ] Changing the teacher shows the count first, moves future lessons, leaves past ones and substitutes
- [ ] Both teachers get an email, and students get one notification

## 5. Weekly schedule

- [ ] Preview shows the right dates and times, in the school's timezone
- [ ] Applying creates the lessons, and they show in the Diary and Teacher App
- [ ] Previewing again says nothing needs changing
- [ ] A busy teacher blocks that one lesson. Students shared with another group only warn
- [ ] Changing a rule leaves lessons with attendance, homework or marks alone
- [ ] A week with a moved lesson leaves the new slot unticked with a warning
- [ ] A meeting link that isn't http(s) is refused
- [ ] Attaching homework after the preview makes Apply ask for a new preview
- [ ] The first timetable sends no notification. A later change sends one per student

## 6. Lesson changes

- [ ] The calendar filters by group and teacher, and steps through weeks
- [ ] Moving a lesson shows Moved in both apps
- [ ] The notification opens the new day, in the student's language. The teacher gets an email
- [ ] Moving onto the group's or teacher's other lesson is refused
- [ ] Cancelling shows Cancelled in both apps. Restoring brings it back
- [ ] A held lesson, or one with attendance, can't be moved or cancelled
- [ ] Changing one lesson's teacher marks a substitute, who gets attendance and topic only
- [ ] A one-off lesson outside the term or in the past is refused

## 7. Settings and Dashboard

- [ ] A changed attendance limit changes the Diary's warning
- [ ] A changed weight fills in on the next mark, and old marks keep theirs
- [ ] Risk at or above warn is refused, and so is a weight of 0
- [ ] The Dashboard lists today's lessons, past lessons without attendance and lessons without an active teacher
- [ ] Students falling behind match the Teacher App's Dashboard

## 8. Final grades and locking

- [ ] Averages match the Diary. Fill empty uses them, and each grade can be changed
- [ ] Drafts are hidden from students
- [ ] Publishing shows the grade in the Diary and gradebook. Unpublishing hides it
- [ ] The term page lists what is still open
- [ ] Once locked, attendance, marks, hand-ins and Panel changes are refused, even from a page already open
- [ ] Unlocking allows changes again

## 9. Reports

- [ ] Attendance %, averages and homework counts equal the Diary's and the Teacher App's
- [ ] Filters work, and a CSV opens in Excel with az/ru letters intact
- [ ] Print or save as PDF shows only the report, readable in dark mode
- [ ] Logged out, the CSV address answers 401

## 10. Privacy and security

- [ ] Nothing in the Panel shows students' notes, to-dos or files
- [ ] Unpublished final grades appear only in the Panel
- [ ] `npm run sync:check` passes
