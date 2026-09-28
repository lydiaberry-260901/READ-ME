// Moca's official logo (public/brand/moca-logo.png).
// On dark backgrounds the same artwork is used as a mask and filled with cream,
// so there is only ever one logo file to keep up to date.
import { logo } from "@/design/tokens";

export function Logo({ onDark = false, height = 28, showProduct = true }: { onDark?: boolean; height?: number; showProduct?: boolean }) {
  const width = Math.round((logo.width / logo.height) * height);
  return (
    <span className="inline-flex items-end gap-2.5">
      {onDark ? (
        <span
          role="img"
          aria-label="Moca"
          className="block bg-cream"
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
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo.src} alt="Moca" width={width} height={height} className="block" />
      )}
      {showProduct ? (
        <span className={`pb-px text-sm font-medium leading-none ${onDark ? "text-ink-soft" : "text-ink-muted"}`}>CRM</span>
      ) : null}
    </span>
  );
}
