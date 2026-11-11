import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({
  sent: [] as { endpoint: string; payload: string }[],
  details: [] as unknown[][],
  failWith: new Map<string, number | "network">(),
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: (...args: unknown[]) => void push.details.push(args),
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      const failure = push.failWith.get(sub.endpoint);
      if (failure === "network") throw new Error("socket hang up");
      if (failure) throw Object.assign(new Error("push failed"), { statusCode: failure });
      push.sent.push({ endpoint: sub.endpoint, payload });
    },
  },
}));

import { db } from "../db";
import { sendPush } from "../push";
import { createWorld, resetDatabase } from "../../../test/db";

const message = { title: "New mark", body: "Math: 90", url: "https://app.example/en/marks", tag: "n1" };
const subscribe = (userId: string, endpoint: string) => db.pushSubscription.create({ data: { userId, endpoint, p256dh: "p", auth: "a" } });

beforeEach(async () => {
  await resetDatabase();
  push.sent.length = 0;
  push.details.length = 0;
  push.failWith.clear();
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
});

describe("sendPush (real database)", () => {
  it("sends to every device of the student, with the message, and says how many accepted it", async () => {
    const w = await createWorld();
    await subscribe(w.student.id, "https://fcm.googleapis.com/a");
    await subscribe(w.student.id, "https://push.services.mozilla.com/b");
    await subscribe(w.teacher.id, "https://fcm.googleapis.com/someone-else");
    expect(await sendPush(w.student.id, message)).toBe(2);
    expect(push.sent.map((s) => s.endpoint).sort()).toEqual(["https://fcm.googleapis.com/a", "https://push.services.mozilla.com/b"]);
    expect(JSON.parse(push.sent[0].payload)).toEqual(message);
    expect(push.details[0]).toEqual(["mailto:admin@example.com", "public-key", "private-key"]);
  });

  it("does nothing, and says so, when push is not configured", async () => {
    const w = await createWorld();
    await subscribe(w.student.id, "https://fcm.googleapis.com/a");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await sendPush(w.student.id, message)).toBe(0);
    expect(push.sent).toEqual([]);
  });

  it("removes a device the push service says is gone, and keeps the rest", async () => {
    const w = await createWorld();
    await subscribe(w.student.id, "https://fcm.googleapis.com/gone");
    await subscribe(w.student.id, "https://fcm.googleapis.com/expired");
    await subscribe(w.student.id, "https://fcm.googleapis.com/ok");
    push.failWith.set("https://fcm.googleapis.com/gone", 410);
    push.failWith.set("https://fcm.googleapis.com/expired", 404);
    expect(await sendPush(w.student.id, message)).toBe(1);
    expect((await db.pushSubscription.findMany()).map((s) => s.endpoint)).toEqual(["https://fcm.googleapis.com/ok"]);
  });

  it("keeps a device after a temporary failure, and logs only the status", async () => {
    const w = await createWorld();
    await subscribe(w.student.id, "https://fcm.googleapis.com/flaky");
    await subscribe(w.student.id, "https://fcm.googleapis.com/down");
    push.failWith.set("https://fcm.googleapis.com/flaky", 503);
    push.failWith.set("https://fcm.googleapis.com/down", "network");
    expect(await sendPush(w.student.id, message)).toBe(0);
    expect(await db.pushSubscription.count()).toBe(2);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("503");
    expect(logged).not.toContain("socket hang up");
  });

  it("never posts to an address that is not a real push service, and forgets it", async () => {
    const w = await createWorld();
    await db.pushSubscription.create({ data: { userId: w.student.id, endpoint: "https://internal.example/hook", p256dh: "p", auth: "a" } });
    await subscribe(w.student.id, "https://fcm.googleapis.com/ok");
    expect(await sendPush(w.student.id, message)).toBe(1);
    expect(push.sent.map((s) => s.endpoint)).toEqual(["https://fcm.googleapis.com/ok"]);
    expect(await db.pushSubscription.count()).toBe(1);
  });

  it("has nothing to send to a student with no devices", async () => {
    const w = await createWorld();
    expect(await sendPush(w.student.id, message)).toBe(0);
  });
});
