import { describe, expect, it } from "vitest";
import { cancelBlock, linkBlock, moveBlock, restoreBlock, teacherBlock } from "../lesson-state";

const now = new Date("2026-11-10T10:00:00Z");
const future = new Date("2026-11-12T10:00:00Z");
const past = new Date("2026-11-08T10:00:00Z");
const lesson = (over: Partial<Parameters<typeof moveBlock>[0]> = {}) => ({
  status: "scheduled" as const,
  startsAt: future,
  attendance: 0,
  termLocked: false,
  ...over,
});

describe("lesson state rules", () => {
  it("a scheduled lesson with no attendance can be moved, cancelled, re-teachered and linked", () => {
    const l = lesson();
    expect(moveBlock(l)).toBeNull();
    expect(cancelBlock(l)).toBeNull();
    expect(teacherBlock(l, now)).toBeNull();
    expect(linkBlock(l)).toBeNull();
  });

  it("a locked term blocks everything", () => {
    const l = lesson({ termLocked: true, status: "cancelled" });
    expect(moveBlock(l)).toBe("termLocked");
    expect(restoreBlock(l, now)).toBe("termLocked");
    expect(teacherBlock(l, now)).toBe("termLocked");
    expect(linkBlock(l)).toBe("termLocked");
  });

  it("attendance is a record of what happened: held lessons can't be moved", () => {
    expect(moveBlock(lesson({ status: "done" }))).toBe("lessonDone");
    expect(moveBlock(lesson({ attendance: 3 }))).toBe("lessonHasAttendance");
  });

  it("a cancelled lesson can't be moved again but can be restored while in the future", () => {
    const l = lesson({ status: "cancelled" });
    expect(moveBlock(l)).toBe("lessonCancelled");
    expect(restoreBlock(l, now)).toBeNull();
    expect(restoreBlock(lesson({ status: "cancelled", startsAt: past }), now)).toBe("lessonPast");
  });

  it("a lesson that never took place can still be cancelled after its date, but its teacher is history", () => {
    const l = lesson({ startsAt: past });
    expect(cancelBlock(l)).toBeNull();
    expect(teacherBlock(l, now)).toBe("lessonPast");
  });

  it("the meeting link can't change on done or cancelled lessons", () => {
    expect(linkBlock(lesson({ status: "done" }))).toBe("lessonDone");
    expect(linkBlock(lesson({ status: "cancelled" }))).toBe("lessonCancelled");
  });
});
