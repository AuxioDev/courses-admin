import "server-only";
import webpush from "web-push";
import { db } from "./db";

export type PushMessage = { title: string; body: string; url: string; tag?: string };

// The server POSTs to whatever endpoint a browser registers, so only real push
// services are accepted. Otherwise a student could aim our server at any address.
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) return false;
    return PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function configured() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", publicKey, privateKey);
  return true;
}

// Sends to every device the student enabled push on. Devices the push service
// reports as gone are removed. Returns how many devices accepted it.
export async function sendPush(userId: string, message: PushMessage) {
  if (!configured()) return 0;
  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      if (!isAllowedPushEndpoint(sub.endpoint)) {
        await db.pushSubscription.deleteMany({ where: { id: sub.id } });
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(message),
          { TTL: 60 * 60 * 24 },
        );
        delivered++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.pushSubscription.deleteMany({ where: { id: sub.id } });
        else console.error(`[push] failed (${status ?? "?"}) for subscription ${sub.id}`);
      }
    }),
  );
  return delivered;
}
