// Laying a week out on a time axis. Pure functions, no framework imports, so they can be tested directly.

export type GridLesson = {
  id: string;
  start: string; // "HH:MM" in the school's timezone
  end: string;
  status: string;
  teacherId: string;
};

export type Placed<T extends GridLesson> = T & {
  startMin: number;
  endMin: number;
  // Lessons that overlap in a day sit side by side: this one is in column `lane` of `lanes`.
  lane: number;
  lanes: number;
  // The same teacher is booked into another lesson at the same time (a cancelled lesson does not count).
  clash: boolean;
};

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const DAY = 24 * 60;
const overlaps = (a: { startMin: number; endMin: number }, b: { startMin: number; endMin: number }) =>
  a.startMin < b.endMin && b.startMin < a.endMin;

export function placeDay<T extends GridLesson>(lessons: T[]): Placed<T>[] {
  const sorted = lessons
    .map((lesson) => {
      const startMin = minutesOf(lesson.start);
      let endMin = minutesOf(lesson.end);
      // A lesson that runs past midnight is drawn to the end of its own day.
      if (endMin <= startMin) endMin = DAY;
      return { ...lesson, startMin, endMin, lane: 0, lanes: 1, clash: false } as Placed<T>;
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Overlapping lessons form a cluster; inside one, each takes the first free column.
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const placed of cluster) placed.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const lesson of sorted) {
    // Back to back (one ends as the next starts) is not an overlap.
    if (cluster.length > 0 && lesson.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= lesson.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = lesson.endMin;
    lesson.lane = lane;
    cluster.push(lesson);
    clusterEnd = Math.max(clusterEnd, lesson.endMin);
  }
  flush();

  const live = out.filter((l) => l.status !== "cancelled");
  for (const a of live) {
    a.clash = live.some((b) => b !== a && b.teacherId === a.teacherId && overlaps(a, b));
  }
  return out;
}

// The hours the grid shows: 08:00 to 20:00 as a floor, wider when a lesson falls outside.
export function hourRange(days: { startMin: number; endMin: number }[][]) {
  let from = 8;
  let to = 20;
  for (const day of days) {
    for (const lesson of day) {
      from = Math.min(from, Math.floor(lesson.startMin / 60));
      to = Math.max(to, Math.ceil(lesson.endMin / 60));
    }
  }
  return { from: Math.max(0, from), to: Math.min(24, to) };
}
