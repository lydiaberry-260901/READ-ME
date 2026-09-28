import Link from "next/link";

export function Pagination({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm text-fg-muted">
      <span>
        Showing {from} to {to} of {total}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="btn btn-secondary py-1.5 no-underline">
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className="btn btn-secondary py-1.5 no-underline">
            Next
          </Link>
        ) : null}
      </span>
    </nav>
  );
}
