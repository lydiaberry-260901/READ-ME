// Filters for the contact list, read from the page address. Shared with CSV downloads later on.
import type { Prisma } from "@/generated/prisma/client";
import type { CustomerGroup } from "@/generated/prisma/enums";
import { visibleWhere, type Actor } from "@/lib/permissions";

export type ContactFilters = {
  q: string;
  group: CustomerGroup | "";
  owner: string;
  tag: string;
  list: string;
  status: "" | "can_contact" | "opted_out" | "phone_check_needed" | "notice_overdue";
  sort: "name" | "company" | "updated";
  page: number;
};

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseContactFilters(params: Params): ContactFilters {
  const group = one(params.group);
  const status = one(params.status);
  const sort = one(params.sort);
  return {
    q: one(params.q).trim().slice(0, 100),
    group: ["ASSET_ESG", "PROPERTY_MANAGER", "OCCUPIER"].includes(group) ? (group as CustomerGroup) : "",
    owner: one(params.owner).slice(0, 40),
    tag: one(params.tag).slice(0, 40),
    list: one(params.list).slice(0, 40),
    status: ["can_contact", "opted_out", "phone_check_needed", "notice_overdue"].includes(status) ? (status as ContactFilters["status"]) : "",
    sort: (["name", "company", "updated"] as const).includes(sort as never) ? (sort as ContactFilters["sort"]) : "name",
    page: Math.max(1, Math.min(Number(one(params.page)) || 1, 10_000)),
  };
}

export function contactWhere(actor: Actor, f: ContactFilters, phoneCheckMaxAgeDays: number, now = new Date()): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [visibleWhere(actor)];
  if (f.q) {
    and.push({
      OR: [
        { firstName: { contains: f.q, mode: "insensitive" } },
        { lastName: { contains: f.q, mode: "insensitive" } },
        { emailNormalised: { contains: f.q.toLowerCase() } },
        { jobTitle: { contains: f.q, mode: "insensitive" } },
        { company: { name: { contains: f.q, mode: "insensitive" } } },
      ],
    });
  }
  if (f.group) and.push({ company: { customerGroup: f.group } });
  if (f.owner === "me") and.push({ ownerId: actor.id });
  else if (f.owner === "none") and.push({ ownerId: null });
  else if (f.owner) and.push({ ownerId: f.owner });
  if (f.tag) and.push({ tags: { some: { tagId: f.tag } } });
  if (f.list) and.push({ listMembers: { some: { listId: f.list } } });

  const phoneCutoff = new Date(now.getTime() - phoneCheckMaxAgeDays * 86_400_000);
  const noticeCutoff = new Date(now.getTime() - 30 * 86_400_000);
  switch (f.status) {
    case "can_contact":
      and.push({ optedOut: false, restricted: false });
      break;
    case "opted_out":
      and.push({ optedOut: true });
      break;
    case "phone_check_needed":
      and.push({ phone: { not: null }, optedOut: false, OR: [{ phoneCheckedAt: null }, { phoneCheckedAt: { lt: phoneCutoff } }] });
      break;
    case "notice_overdue":
      and.push({ privacyNoticeSentAt: null, collectedAt: { lt: noticeCutoff }, optedOut: false });
      break;
  }
  return { AND: and };
}

export function contactOrderBy(f: ContactFilters): Prisma.ContactOrderByWithRelationInput[] {
  switch (f.sort) {
    case "company":
      return [{ company: { name: "asc" } }, { firstName: "asc" }];
    case "updated":
      return [{ updatedAt: "desc" }];
    default:
      return [{ firstName: "asc" }, { lastName: "asc" }];
  }
}
