// Plain English names for the fixed lists stored in the database.
import type {
  CustomerGroup,
  HealthFlag,
  LossReason,
  Role,
  StakeholderRole,
  ContactEntityType,
  LawfulBasis,
} from "@/generated/prisma/enums";

export const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  REP: "Rep",
};

export const roleDescriptions: Record<Role, string> = {
  ADMIN: "Sees everything and manages people, settings and data protection.",
  MANAGER: "Sees their own and their team's records, plus anything shared.",
  REP: "Sees their own records, plus anything shared.",
};

export const customerGroupLabels: Record<CustomerGroup, string> = {
  ASSET_ESG: "Asset and ESG",
  PROPERTY_MANAGER: "Property manager",
  OCCUPIER: "Occupier",
};

export const healthFlagLabels: Record<HealthFlag, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  STALLED: "Stalled",
};

// The fixed list of reasons for losing a deal, in the order shown on screen.
export const lossReasonLabels: Record<LossReason, string> = {
  BUDGET: "Budget",
  TIMING: "Timing",
  NO_DECISION: "No decision",
  LOST_TO_COMPETITOR: "Lost to competitor",
  NO_ECONOMIC_BUYER: "No economic buyer",
  PRODUCT_FIT: "Product fit",
  OTHER: "Other",
};

export const stakeholderRoleLabels: Record<StakeholderRole, string> = {
  CHAMPION: "Champion",
  ECONOMIC_BUYER: "Economic buyer",
  BLOCKER: "Blocker",
  INFLUENCER: "Influencer",
  USER: "User",
};

export const entityTypeLabels: Record<ContactEntityType, string> = {
  LIMITED_COMPANY: "Limited company",
  PUBLIC_BODY: "Public body",
  LLP: "Limited liability partnership",
  SOLE_TRADER: "Sole trader",
  PARTNERSHIP: "Partnership",
  UNKNOWN: "Not known yet",
};

export const lawfulBasisLabels: Record<LawfulBasis, string> = {
  LEGITIMATE_INTERESTS: "Legitimate interests",
  CONSENT: "Consent",
  CONTRACT: "Contract",
};
