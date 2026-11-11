"use client";

import { Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import { LinkPending } from "./link-pending";
import { usePathname } from "next/navigation";
import { localePath, type Locale } from "@/i18n/config";
import { BookIcon, CalendarIcon, NoteIcon, SunIcon, TaskIcon, UserIcon, UsersIcon } from "./icons";

// Here rather than in icons.tsx, which must stay identical to the Teacher App's.
function GroupsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function InboxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M3 13.5 5.6 5.4A2 2 0 0 1 7.5 4h9a2 2 0 0 1 1.9 1.4L21 13.5V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 13.5h5l1.5 2.5h5l1.5-2.5h5" />
    </svg>
  );
}

export type NavLabels = {
  dashboard: string;
  courses: string;
  users: string;
  groups: string;
  applications: string;
  schedule: string;
  terms: string;
  reports: string;
  settings: string;
  profile: string;
  more: string;
  main: string;
  appName: string;
};

type Item = { path: string; key: Exclude<keyof NavLabels, "main" | "appName" | "more">; Icon: ComponentType<SVGProps<SVGSVGElement>> };

// Pages are added here as each build step ships them.
const items: Item[] = [
  { path: "/", key: "dashboard", Icon: SunIcon },
  { path: "/courses", key: "courses", Icon: BookIcon },
  { path: "/users", key: "users", Icon: UsersIcon },
  { path: "/groups", key: "groups", Icon: GroupsIcon },
  { path: "/applications", key: "applications", Icon: InboxIcon },
  { path: "/schedule", key: "schedule", Icon: CalendarIcon },
  { path: "/terms", key: "terms", Icon: TaskIcon },
  { path: "/reports", key: "reports", Icon: NoteIcon },
  { path: "/settings", key: "settings", Icon: SettingsIcon },
  { path: "/profile", key: "profile", Icon: UserIcon },
];

function isActive(path: string, pathname: string | null) {
  if (pathname === null) return false;
  return path === "/" ? pathname === "/" : pathname.startsWith(path);
}

// applicationsBadge: the count of new applications, streamed in by the layout.
type Props = { locale: Locale; labels: NavLabels; applicationsBadge?: ReactNode };
type ViewProps = Props & { pathname: string | null };

// The Panel is a desktop tool, so on a phone the bar keeps the four pages used every day and puts the rest behind
// "More". Ten tabs in a row would scroll sideways with nothing to say that more exist.
const DAILY = ["/", "/users", "/groups", "/applications"];
const daily = items.filter((item) => DAILY.includes(item.path));
const rest = items.filter((item) => !DAILY.includes(item.path));

function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <circle cx="5.5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18.5" cy="12" r="1.8" />
    </svg>
  );
}

function Bar({ locale, labels, pathname, applicationsBadge }: ViewProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const moreActive = rest.some((item) => isActive(item.path, pathname));

  // Outside taps and Escape close the sheet; Escape hands focus back to the button that opened it.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <nav
      ref={root}
      aria-label={labels.main}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur md:hidden print:hidden"
    >
      {open && (
        <ul id="more-menu" className="more-sheet absolute inset-x-0 bottom-full grid grid-cols-2 gap-1 border-t border-line bg-surface p-2 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)]">
          {rest.map(({ path, key, Icon }) => {
            const active = isActive(path, pathname);
            return (
              <li key={path}>
                <Link
                  href={localePath(locale, path)}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium ${
                    active ? "bg-surface-2 text-accent" : "text-ink"
                  }`}
                >
                  <Icon width={20} height={20} strokeWidth={active ? 2.2 : 1.8} />
                  {labels[key]}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <ul className="flex">
        {daily.map(({ path, key, Icon }) => {
          const active = isActive(path, pathname);
          return (
            <li key={path} className="min-w-0 flex-1">
              <Link
                href={localePath(locale, path)}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span className="relative">
                  <Icon strokeWidth={active ? 2.2 : 1.8} />
                  {key === "applications" && <span className="absolute -right-3 -top-1">{applicationsBadge}</span>}
                </span>
                <span className="max-w-full truncate px-0.5">{labels[key]}</span>
                <LinkPending />
              </Link>
            </li>
          );
        })}
        <li className="min-w-0 flex-1">
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls="more-menu"
            onClick={() => setOpen((value) => !value)}
            className={`flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              open || moreActive ? "text-accent" : "text-muted"
            }`}
          >
            <MoreIcon />
            <span className="max-w-full truncate px-0.5">{labels.more}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function Side({ locale, labels, pathname, applicationsBadge }: ViewProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-line bg-surface-2 md:flex print:hidden">
      <Link href={localePath(locale, "/")} className="flex h-14 items-center gap-2 px-5 text-[15px] font-semibold tracking-tight">
        <BookIcon className="text-accent" />
        {labels.appName}
      </Link>
      <nav aria-label={labels.main} className="overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {items.map(({ path, key, Icon }) => {
            const active = isActive(path, pathname);
            return (
              <li key={path}>
                <Link
                  href={localePath(locale, path)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium ${
                    active ? "border-accent bg-surface text-accent" : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  <Icon width={20} height={20} strokeWidth={active ? 2.2 : 1.8} />
                  {labels[key]}
                  {key === "applications" && <span className="ml-auto">{applicationsBadge}</span>}
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function Views(props: ViewProps) {
  return (
    <>
      <Bar {...props} />
      <Side {...props} />
    </>
  );
}

function ActiveViews(props: Props) {
  // Strip the /az, /en or /ru prefix before matching.
  const path = usePathname().replace(/^\/[^/]+/, "") || "/";
  return <Views {...props} pathname={path} />;
}

// The path is only known at request time on dynamic routes, so the static shell
// renders the navigation without an active item and the highlight streams in.
export function AppNav(props: Props) {
  return (
    <Suspense fallback={<Views {...props} pathname={null} />}>
      <ActiveViews {...props} />
    </Suspense>
  );
}
