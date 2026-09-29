// Plain names for the audit log entries that record access to personal data.
export const ACCESS_ACTIONS = ["contact.viewed", "transcript.viewed", "contact.erased", "contact.opted_out", "contact.restricted"];

const labels: Record<string, string> = {
  "contact.viewed": "viewed a contact",
  "transcript.viewed": "viewed a call transcript",
  "contact.erased": "deleted a contact's details",
  "contact.opted_out": "opted a contact out",
  "contact.restricted": "limited the use of a contact's details",
  "export.subject_access": "downloaded everything held about a person",
  "export.contacts": "downloaded the contacts list",
  "export.companies": "downloaded the companies list",
  "export.deals": "downloaded the deals list",
  "export.tasks": "downloaded the task list",
  "export.news": "downloaded the news list",
};

export function accessLabel(action: string) {
  if (labels[action]) return labels[action];
  if (action.startsWith("export.analytics.")) return "downloaded a dashboard table";
  if (action.startsWith("export.")) return `downloaded ${action.slice(7).replace(/[._]/g, " ")}`;
  return action.replace(/[._]/g, " ");
}
