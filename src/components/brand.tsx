const BRAND = "SkyEd";

// The school's name as a wordmark: "Sky" in the text colour, "Ed" in the brand blue (the logo's own weights: Sky bold,
// Ed regular). A name that starts with "SkyEd" is split, so "SkyEd Student Diary" shows the wordmark followed by the
// app's name in plain text. Any other name is shown unchanged. Plain-text places (page titles, emails' subject lines,
// the manifest) use the string as it is.
export function Brand({ name = BRAND, className }: { name?: string; className?: string }) {
  if (!name.startsWith(BRAND)) return <span className={className}>{name}</span>;
  const rest = name.slice(BRAND.length).trim();
  return (
    <span className={className}>
      <span className="brand-sky">Sky</span>
      <span className="brand-ed">Ed</span>
      {rest && <span className="brand-role"> {rest}</span>}
    </span>
  );
}
