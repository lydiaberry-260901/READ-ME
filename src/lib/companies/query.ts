// Filters for the company list, read from the page address. Shared with CSV downloads later on.
import type { Prisma } from "@/generated/prisma/client";
import type { CustomerGroup } from "@/generated/prisma/enums";
import { visibleWhere, type Actor } from "@/lib/permissions";

export type CompanyFilters = {
  q: string;
  group: CustomerGroup | "none" | "";
  importance: "" | "1" | "2" | "3";
  owner: string; // user id, "me", "none" or ""
  minScore: "" | "1" | "2" | "3" | "4" | "5" | "unscored";
  tag: string;
  list: string;
  sort: "name" | "score" | "updated" | "importance";
  page: number;
};

const GROUPS = ["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER", "none"] as const;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseCompanyFilters(params: Params): CompanyFilters {
  const group = one(params.group);
  const importance = one(params.importance);
  const minScore = one(params.minScore);
  const sort = one(params.sort);
  const page = Number(one(params.page)) || 1;
  return {
    q: one(params.q).trim().slice(0, 100),
    group: (GROUPS as readonly string[]).includes(group) ? (group as CompanyFilters["group"]) : "",
    importance: ["1", "2", "3"].includes(importance) ? (importance as CompanyFilters["importance"]) : "",
    owner: one(params.owner).slice(0, 40),
    minScore: ["1", "2", "3", "4", "5", "unscored"].includes(minScore) ? (minScore as CompanyFilters["minScore"]) : "",
    tag: one(params.tag).slice(0, 40),
    list: one(params.list).slice(0, 40),
    sort: (["name", "score", "updated", "importance"] as const).includes(sort as never) ? (sort as CompanyFilters["sort"]) : "name",
    page: Math.max(1, Math.min(page, 10_000)),
  };
}

export function companyWhere(actor: Actor, f: CompanyFilters): Prisma.CompanyWhereInput {
  const and: Prisma.CompanyWhereInput[] = [visibleWhere(actor)];
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { domain: { contains: f.q.toLowerCase() } },
        { alternativeNames: { has: f.q } },
      ],
    });
  }
  if (f.group === "none") and.push({ customerGroup: null });
  else if (f.group) and.push({ customerGroup: f.group });
  if (f.importance) and.push({ importance: Number(f.importance) });
  if (f.owner === "me") and.push({ ownerId: actor.id });
  else if (f.owner === "none") and.push({ ownerId: null });
  else if (f.owner) and.push({ ownerId: f.owner });
  if (f.minScore === "unscored") and.push({ score: null });
  else if (f.minScore) and.push({ score: { gte: Number(f.minScore) } });
  if (f.tag) and.push({ tags: { some: { tagId: f.tag } } });
  if (f.list) and.push({ listMembers: { some: { listId: f.list } } });
  return { AND: and };
}

export function companyOrderBy(f: CompanyFilters): Prisma.CompanyOrderByWithRelationInput[] {
  switch (f.sort) {
    case "score":
      return [{ score: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    case "updated":
      return [{ updatedAt: "desc" }];
    case "importance":
      return [{ importance: "asc" }, { name: "asc" }];
    default:
      return [{ name: "asc" }];
  }
}

/** Turns filters back into a page address query, leaving out empty values. */
export function filtersToQuery(f: Partial<Record<string, string | number>>, overrides: Partial<Record<string, string | number>> = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...overrides })) {
    if (v === undefined || v === "" || (k === "page" && Number(v) === 1) || (k === "sort" && v === "name")) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const PAGE_SIZE = 50;
