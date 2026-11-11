import { describe, expect, it } from "vitest";
import { mapConcurrent } from "../concurrency";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapConcurrent", () => {
  it("returns outcomes in input order", async () => {
    const out = await mapConcurrent([3, 1, 2], 3, async (n) => {
      await sleep(n * 5);
      return n * 10;
    });
    expect(out).toEqual([
      { status: "fulfilled", value: 30 },
      { status: "fulfilled", value: 10 },
      { status: "fulfilled", value: 20 },
    ]);
  });

  it("never runs more than `limit` at once", async () => {
    let running = 0;
    let peak = 0;
    await mapConcurrent(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      peak = Math.max(peak, ++running);
      await sleep(5);
      running--;
    });
    expect(peak).toBe(4);
  });

  it("a failing item does not stop the others", async () => {
    const done: number[] = [];
    const out = await mapConcurrent([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      done.push(n);
    });
    expect(done.sort()).toEqual([1, 3, 4]);
    expect(out.map((o) => o.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled"]);
  });

  it("handles an empty list and a limit below one", async () => {
    expect(await mapConcurrent([], 5, async () => 1)).toEqual([]);
    expect(await mapConcurrent([1, 2], 0, async (n) => n)).toHaveLength(2);
  });
});
