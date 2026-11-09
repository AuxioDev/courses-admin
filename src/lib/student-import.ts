import "server-only";
import { z } from "zod";
import { db } from "./db";
import { parseCsvLine } from "./csv";

export const MAX_IMPORT_ROWS = 100;
export const MAX_IMPORT_CHARS = 100_000;

export type ImportProblem = {
  line: number | null;
  key: "headerMissing" | "tooMany" | "nameMissing" | "emailInvalid" | "emailDuplicate" | "unknownGroup" | "ambiguousGroup";
  value?: string;
};

type Row = { line: number; name: string; email: string; group: string };

const emailSchema = z.email();

function parse(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  // Excel writes semicolons on computers set to Russian and many other languages.
  const delimiter = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const header = parseCsvLine(lines[0], delimiter).map((h) => h.toLowerCase());
  const [nameAt, emailAt, groupAt] = ["name", "email", "group"].map((h) => header.indexOf(h));
  const rows: Row[] = [];
  const problems: ImportProblem[] = [];
  if (nameAt < 0 || emailAt < 0) {
    problems.push({ line: null, key: "headerMissing" });
    return { rows, problems };
  }

  const seen = new Set<string>();
  lines.slice(1).forEach((raw, i) => {
    if (!raw.trim()) return;
    const line = i + 2;
    const fields = parseCsvLine(raw, delimiter);
    const name = fields[nameAt] ?? "";
    const email = (fields[emailAt] ?? "").toLowerCase();
    if (!name || name.length > 100) problems.push({ line, key: "nameMissing" });
    if (!emailSchema.safeParse(email).success) problems.push({ line, key: "emailInvalid", value: email });
    else if (seen.has(email)) problems.push({ line, key: "emailDuplicate", value: email });
    seen.add(email);
    rows.push({ line, name, email, group: groupAt >= 0 ? (fields[groupAt] ?? "") : "" });
  });
  if (rows.length > MAX_IMPORT_ROWS) problems.push({ line: null, key: "tooMany", value: String(MAX_IMPORT_ROWS) });
  return { rows, problems };
}

// Reads the list and compares it with the database. Changes nothing.
export async function analyzeImport(text: string) {
  const { rows, problems } = parse(text);

  // Group names can repeat across courses and terms, so a name must point at exactly one
  // group that can still change.
  const names = [...new Set(rows.map((r) => r.group).filter(Boolean))];
  const groups = await db.group.findMany({
    where: { name: { in: names }, term: { locked: false } },
    select: { id: true, name: true },
  });
  const groupIds = new Map<string, string[]>();
  for (const group of groups) groupIds.set(group.name, [...(groupIds.get(group.name) ?? []), group.id]);
  for (const row of rows) {
    if (!row.group) continue;
    const ids = groupIds.get(row.group) ?? [];
    if (ids.length === 0) problems.push({ line: row.line, key: "unknownGroup", value: row.group });
    if (ids.length > 1) problems.push({ line: row.line, key: "ambiguousGroup", value: row.group });
  }

  const existing = new Set(
    (await db.user.findMany({ where: { email: { in: rows.map((r) => r.email) } }, select: { email: true } })).map(
      (u) => u.email,
    ),
  );
  problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return {
    rows: rows.map((r) => ({ ...r, exists: existing.has(r.email), groupId: groupIds.get(r.group)?.[0] ?? null })),
    problems,
  };
}
