// Who can see and change call transcripts. Transcripts hold personal data, so access is limited to
// the person who added the call (and their manager), people who can see the linked deal or contact,
// and admins.
import type { Prisma } from "@/generated/prisma/client";
import { canEdit, canView, visibleWhere, type Actor } from "@/lib/permissions";

type Linked = {
  organisationId: string;
  uploadedById: string | null;
  deal: { organisationId: string; ownerId: string; isShared: boolean } | null;
  contact: { organisationId: string; ownerId: string | null; isShared: boolean } | null;
};

export function transcriptWhere(actor: Actor): Prisma.CallTranscriptWhereInput {
  if (actor.role === "ADMIN") return { organisationId: actor.organisationId };
  return {
    organisationId: actor.organisationId,
    OR: [{ uploadedById: { in: actor.visibleOwnerIds } }, { deal: visibleWhere(actor) }, { contact: visibleWhere(actor) }],
  };
}

export function canViewTranscript(actor: Actor, t: Linked) {
  if (t.organisationId !== actor.organisationId) return false;
  if (actor.role === "ADMIN") return true;
  if (t.uploadedById && actor.visibleOwnerIds.includes(t.uploadedById)) return true;
  return Boolean((t.deal && canView(actor, t.deal)) || (t.contact && canView(actor, t.contact)));
}

/** Linking, recording notice details and deleting: the person who added it (or their manager), the deal's editors, or an admin. */
export function canManageTranscript(actor: Actor, t: Linked) {
  if (!canViewTranscript(actor, t)) return false;
  if (actor.role === "ADMIN") return true;
  if (t.uploadedById && actor.visibleOwnerIds.includes(t.uploadedById)) return true;
  if (t.deal && canEdit(actor, t.deal, { sharedIsEditable: false })) return true;
  return Boolean(!t.deal && t.contact && canEdit(actor, t.contact, { sharedIsEditable: true }));
}
