import type { ReactNode } from "react";

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted first-letter:uppercase">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  // Lists pass "p-0" to run edge to edge; two padding classes would otherwise clash.
  const padding = className.includes("p-0") ? "" : "p-4";
  return <div className={`rounded-2xl border border-line bg-surface ${padding} ${className}`}>{children}</div>;
}

// An empty list. With `action` (a link or button) it also says what to do next.
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  if (!action) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>
    );
  }
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
      <p className="text-sm text-muted">{children}</p>
      <div className="mt-3 flex justify-center">{action}</div>
    </div>
  );
}

const tones = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-surface-2 text-ink",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
} as const;

export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

// `label` is read out to screen readers while the real content is on its way ("Loading…", in the page's language).
export function Skeleton({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" role={label ? "status" : undefined}>
      {label && <span className="sr-only">{label}</span>}
      <div className="h-7 w-40 animate-pulse rounded-lg bg-surface-2" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-2" />
      ))}
    </div>
  );
}
