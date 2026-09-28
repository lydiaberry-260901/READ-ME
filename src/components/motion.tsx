"use client";

// Motion helpers. Numbers count up to their value when a page opens, and move smoothly when
// the value changes. People whose computer asks for reduced motion see the final value at once.
import { useEffect, useRef, useState } from "react";

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedNumber({ value, format = "number", durationMs = 900 }: { value: number; format?: "number" | "pounds" | "percent"; durationMs?: number }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs);
      setShown(origin + (value - origin) * easeOut(p));
      if (p < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced, durationMs]);

  const rounded = Math.round(shown);
  const text =
    format === "pounds"
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(rounded)
      : format === "percent"
        ? `${rounded}%`
        : new Intl.NumberFormat("en-GB").format(rounded);
  // Screen readers get the final value straight away.
  return (
    <>
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">
        {format === "pounds"
          ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value)
          : format === "percent" ? `${value}%` : value}
      </span>
    </>
  );
}

/** A bar that grows from nothing to its width when the page opens. */
export function GrowBar({ pct, className, delayMs = 0, colour }: { pct: number; className: string; delayMs?: number; colour?: string }) {
  const reduced = usePrefersReducedMotion();
  const [w, setW] = useState(reduced ? pct : 0);
  useEffect(() => {
    if (reduced) {
      setW(pct);
      return;
    }
    const t = setTimeout(() => setW(pct), 30 + delayMs);
    return () => clearTimeout(t);
  }, [pct, reduced, delayMs]);
  return <span className={className} style={{ width: `${w}%`, background: colour, transition: "width 900ms cubic-bezier(0.22, 1, 0.36, 1)" }} />;
}
