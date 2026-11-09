import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";

export function PrivacyNotice({ t }: { t: Dictionary["privacy"] }) {
  const contact = process.env.PRIVACY_CONTACT_EMAIL || t.contactFallback;
  const sections = [
    [t.collectTitle, t.collectBody],
    [t.studentsTitle, t.studentsBody],
    [t.whoTitle, t.whoBody],
    [t.whereTitle, t.whereBody],
    [t.keepTitle, t.keepBody],
    [t.contactTitle, fmt(t.contactBody, { contact })],
  ];
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p>{t.intro}</p>
      {sections.map(([title, body]) => (
        <section key={title}>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-0.5 text-muted">{body}</p>
        </section>
      ))}
    </div>
  );
}
