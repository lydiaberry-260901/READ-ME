"use client";

// Quick search and navigation, opened with Ctrl+K (or Cmd+K on a Mac) from anywhere.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

type Result = { kind: string; title: string; detail: string; href: string };

export function CommandBar({ pages }: { pages: { href: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Search as you type, waiting briefly so each key press does not send a request.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (res.ok) setResults(((await res.json()) as { results: Result[] }).results);
      } catch {
        // A newer search replaced this one.
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pageMatches = pages
      .filter((p) => !q || p.label.toLowerCase().includes(q))
      .map((p) => ({ kind: "Go to", title: p.label, detail: "", href: p.href }));
    return [...results, ...pageMatches].slice(0, 14);
  }, [pages, query, results]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-line bg-panel px-3 py-1.5 text-sm text-fg-muted hover:border-line-strong hover:text-fg"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-line px-1.5 text-xs font-sans sm:inline">Ctrl K</kbd>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search the CRM"
            className="w-full max-w-xl overflow-hidden rounded-lg border border-line-strong bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                }
                if (e.key === "Enter" && items[active]) go(items[active].href);
              }}
              placeholder="Search deals, companies and contacts, or jump to a page"
              aria-label="Search"
              aria-controls="command-results"
              className="w-full border-b border-line bg-transparent px-4 py-3.5 text-base text-fg outline-none placeholder:text-fg-soft"
            />
            <ul id="command-results" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
              {items.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-fg-muted">{loading ? "Searching" : "Nothing found. Try a company or person's name."}</li>
              ) : (
                items.map((item, i) => (
                  <li key={`${item.kind}-${item.href}`} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(item.href)}
                      className={clsx("flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left text-sm", i === active ? "bg-panel-raised" : "")}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-fg">{item.title}</span>
                        {item.detail ? <span className="block truncate text-xs text-fg-muted">{item.detail}</span> : null}
                      </span>
                      <span className="shrink-0 text-xs text-fg-muted">{item.kind}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <p className="border-t border-line px-4 py-2 text-xs text-fg-muted">Arrow keys to move, Enter to open, Esc to close.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
