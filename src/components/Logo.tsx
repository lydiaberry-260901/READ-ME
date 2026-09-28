// Moca's official logo (public/brand/moca-logo.png).
// The app is dark, so the artwork is used as a mask and filled with the text colour.
// There is only ever one logo file to keep up to date.
import { logo } from "@/design/tokens";

export function Logo({ height = 28, showProduct = true }: { height?: number; showProduct?: boolean }) {
  const width = Math.round((logo.width / logo.height) * height);
  return (
    <span className="inline-flex items-end gap-2.5">
      <span
        role="img"
        aria-label="Moca"
        className="block bg-fg"
        style={{
          width,
          height,
          maskImage: `url(${logo.src})`,
          WebkitMaskImage: `url(${logo.src})`,
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
      />
      {showProduct ? <span className="pb-px text-sm font-medium leading-none text-fg-muted">CRM</span> : null}
    </span>
  );
}
