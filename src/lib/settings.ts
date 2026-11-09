import "server-only";
import { z } from "zod";
import { db } from "./db";
import type { MarkType } from "@/generated/prisma/enums";

const DEFAULTS = { attendanceWarnBelow: 80, attendanceRiskBelow: 70 };

export async function getSchoolSettings() {
  const row = await db.schoolSettings.findUnique({ where: { id: 1 } });
  return {
    attendanceWarnBelow: row?.attendanceWarnBelow ?? DEFAULTS.attendanceWarnBelow,
    attendanceRiskBelow: row?.attendanceRiskBelow ?? DEFAULTS.attendanceRiskBelow,
  };
}

const WEIGHT_DEFAULTS: Record<MarkType, number> = { classwork: 1, quiz: 2, exam: 3, homework: 1 };

// The column is free-form JSON edited elsewhere, so anything unusable falls back to the default.
const weightsSchema = z.object({
  classwork: z.number().positive().catch(WEIGHT_DEFAULTS.classwork),
  quiz: z.number().positive().catch(WEIGHT_DEFAULTS.quiz),
  exam: z.number().positive().catch(WEIGHT_DEFAULTS.exam),
  homework: z.number().positive().catch(WEIGHT_DEFAULTS.homework),
});

export async function getMarkWeights(): Promise<Record<MarkType, number>> {
  const row = await db.schoolSettings.findUnique({ where: { id: 1 }, select: { markWeights: true } });
  const parsed = weightsSchema.safeParse(row?.markWeights);
  return parsed.success ? parsed.data : WEIGHT_DEFAULTS;
}
