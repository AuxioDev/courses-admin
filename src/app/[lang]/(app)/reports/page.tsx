import Form from "next/form";
import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentAdmin } from "@/lib/auth";
import { buildReport, REPORT_TYPES, resolveReportFilters, type ReportCell } from "@/lib/reports";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Empty, PageTitle } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.nav.reports };
}

// Waiting for the data on the server beats flashing a skeleton first.
export const instant = false;

const TONES = { good: "text-good", warn: "text-warn", bad: "text-bad" } as const;
const toneOf = (cell: ReportCell) => (cell.tone ? TONES[cell.tone] : "");

export default function ReportsPage({ searchParams }: PageProps<"/[lang]/reports">) {
  return <Reports searchParams={searchParams} />;
}

async function Reports({ searchParams }: Pick<PageProps<"/[lang]/reports">, "searchParams">) {
  const [{ locale, t }, params] = await Promise.all([getI18n(), searchParams, getCurrentAdmin()]);
  const filters = await resolveReportFilters(params);
  const { type, terms, term, groups, groupId } = filters;
  const report = term ? await buildReport(filters, t) : null;

  const query = (target: string) =>
    new URLSearchParams({
      type: target,
      ...(term ? { term: term.id } : {}),
      ...(groupId ? { group: groupId } : {}),
    }).toString();

  return (
    <div className="print:[&_*]:!text-black">
      <PageTitle
        title={t.reports.title[type]}
        subtitle={term ? [term.name, groups.find((g) => g.id === groupId)?.name].filter(Boolean).join(" · ") : undefined}
        action={
          report &&
          report.rows.length > 0 && (
            <div className="flex flex-wrap justify-end gap-2 print:hidden">
              <PrintButton label={t.reports.print} />
              <a href={`/api/reports?${query(type)}&lang=${locale}`} className="btn">
                {t.reports.download}
              </a>
            </div>
          )
        }
      />
      <nav aria-label={t.nav.reports} className="mb-3 flex flex-wrap gap-2 print:hidden">
        {REPORT_TYPES.map((target) => (
          <Link
            key={target}
            href={localePath(locale, `/reports?${query(target)}`)}
            aria-current={target === type ? "page" : undefined}
            className={target === type ? "btn" : "btn-ghost"}
          >
            {t.reports.tabs[target]}
          </Link>
        ))}
      </nav>
      {/* The key resets the fields when a link changes the filters. */}
      <Form
        key={`${term?.id}-${groupId}`}
        action={localePath(locale, "/reports")}
        className="mb-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] print:hidden"
      >
        <input type="hidden" name="type" value={type} />
        <select name="term" defaultValue={term?.id} aria-label={t.reports.term} className="field">
          {terms.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select name="group" defaultValue={groupId ?? ""} aria-label={t.reports.group} className="field">
          <option value="">{t.reports.allGroups}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} · {group.course.title}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost">
          {t.reports.filter}
        </button>
      </Form>

      {!report || report.rows.length === 0 ? (
        <Empty>{t.reports.none}</Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface print:overflow-visible print:border-0">
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                {report.headers.map((header) => (
                  <th key={header} className="whitespace-nowrap px-3 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={`whitespace-nowrap px-3 py-2 ${toneOf(cell)}`}>
                      {cell.text}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {type === "teachers" && <p className="mt-2 text-xs text-muted">{t.reports.teachersHint}</p>}
    </div>
  );
}
