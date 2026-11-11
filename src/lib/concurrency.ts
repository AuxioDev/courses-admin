// Runs `fn` for every item, at most `limit` at a time, and never throws: each outcome is returned in input
// order, so one failing item cannot stop the rest. Used for fan-out work (notifications to a whole group),
// which done one by one can outlast a serverless function and done all at once would exhaust the database pool.
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}

// Each notification takes a few queries; a handful at once keeps the pooled connection count modest.
export const NOTIFY_CONCURRENCY = 5;
