import { NextResponse } from "next/server";
import { getAdminOrNull } from "@/lib/auth";
import { csvFile } from "@/lib/csv";
import { buildReport, resolveReportFilters } from "@/lib/reports";
import { getDictionary } from "@/i18n";
import { defaultLocale, hasLocale } from "@/i18n/config";

// The same report the page shows, as a file that opens in Excel.
export async function GET(request: Request) {
  const admin = await getAdminOrNull();
  if (!admin) return new NextResponse(null, { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = await resolveReportFilters(params);
  if (!filters.term) return new NextResponse(null, { status: 404 });

  const t = getDictionary(hasLocale(params.lang) ? params.lang : defaultLocale);
  const report = await buildReport(filters, t);
  const body = csvFile([report.headers, ...report.rows.map((row) => row.map((c) => c.text))]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filters.type}-report.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
