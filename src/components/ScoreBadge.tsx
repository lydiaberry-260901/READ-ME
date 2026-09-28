import clsx from "clsx";

/** Company score, shown as a number so the meaning never depends on colour alone. */
export function ScoreBadge({ score, size = "sm" }: { score: number | null; size?: "sm" | "lg" }) {
  if (score === null) {
    return <span className="text-xs text-mocha-muted">Not scored</span>;
  }
  const tone = score >= 4 ? "bg-green-tint text-green-ink border-green/30" : score === 3 ? "bg-amber-tint text-amber-ink border-amber/50" : "bg-surface-sunk text-mocha border-stone";
  return (
    <span
      className={clsx(
        "inline-flex items-baseline gap-0.5 rounded-md border font-semibold tabular-nums",
        tone,
        size === "lg" ? "px-3 py-1 text-2xl" : "px-2 py-0.5 text-sm",
      )}
      aria-label={`Score ${score} out of 5`}
      title={`Score ${score} out of 5`}
    >
      {score}
      <span className={clsx("font-normal opacity-70", size === "lg" ? "text-sm" : "text-xs")}>/5</span>
    </span>
  );
}
