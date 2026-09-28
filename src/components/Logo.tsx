// The Moca CRM mark: a rising sun over a building line, for energy and property.
// Colours come from the design settings through Tailwind classes.
export function LogoMark({ size = 32, onDark = false }: { size?: number; onDark?: boolean }) {
  const line = onDark ? "stroke-cream" : "stroke-mocha";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="18" r="8" className="fill-amber" />
      <path d="M4 26h24" className={line} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 26v-7h4v7M19 26v-10h4v10" className={line} strokeWidth="2" fill="none" strokeLinejoin="round" />
      <path d="M16 4v3M6.5 8.5l2 2M25.5 8.5l-2 2" className="stroke-green" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ onDark = false }: { onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark onDark={onDark} />
      <span className={`text-lg font-semibold tracking-tight ${onDark ? "text-cream" : "text-mocha"}`}>
        Moca <span className={onDark ? "font-normal text-mocha-soft" : "font-normal text-mocha-muted"}>CRM</span>
      </span>
    </span>
  );
}
