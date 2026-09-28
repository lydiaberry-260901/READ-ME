import clsx from "clsx";

/**
 * Company score as five dots, echoing the dots in Moca's logo. Filled dots show the score,
 * and the number is always written beside them, so the meaning never depends on colour alone.
 */
export function ScoreBadge({ score, size = "sm" }: { score: number | null; size?: "sm" | "lg" }) {
  if (score === null) {
    return <span className="text-xs text-fg-muted">Not scored</span>;
  }
  const fill = score >= 4 ? "bg-green-text" : score === 3 ? "bg-amber" : "bg-fg";
  const dot = size === "lg" ? "size-3.5" : "size-2";
  return (
    <span className="inline-flex shrink-0 items-center gap-2" role="img" aria-label={`Score ${score} out of 5`} title={`Score ${score} out of 5`}>
      <span className={clsx("inline-flex items-center", size === "lg" ? "gap-1.5" : "gap-1")} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={clsx("rounded-full", dot, n <= score ? fill : "border border-line-strong/70 bg-transparent")} />
        ))}
      </span>
      <span aria-hidden="true" className={clsx("font-semibold tabular-nums", size === "lg" ? "text-xl" : "text-sm")}>
        {score}
        <span className="font-normal text-fg-muted">/5</span>
      </span>
    </span>
  );
}
