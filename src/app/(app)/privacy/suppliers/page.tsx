import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ensureDefaultSuppliers } from "@/lib/privacy/setup";
import { Badge } from "@/components/ui";
import { SupplierForm } from "../forms";
import { deleteSupplier } from "../actions";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const user = await requireCapability("privacy.access");
  await ensureDefaultSuppliers(user.organisationId);
  const suppliers = await prisma.supplier.findMany({ where: { organisationId: user.organisationId }, orderBy: { name: "asc" } });
  const withDpa = suppliers.filter((s) => s.dpaInPlace).length;
  const unconfirmed = suppliers.filter((s) => !s.location).length;

  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">Suppliers that handle our data</h1>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Every supplier that stores or processes personal data for us, what they receive, where it is kept, and whether a data processing agreement is in place. The standard entries say only what this CRM sends them. Confirm the rest from each supplier&apos;s terms, and prefer UK or EU locations where offered.
        </p>
        <p className="mt-3 flex flex-wrap gap-2 text-sm">
          <Badge tone={withDpa === suppliers.length ? "green" : "amber"}>{withDpa} of {suppliers.length} with an agreement</Badge>
          {unconfirmed ? <Badge tone="amber">{unconfirmed} storage locations not confirmed</Badge> : null}
        </p>
      </header>

      <ul className="grid gap-4">
        {suppliers.map((s) => (
          <li key={s.id} className="rounded-lg border border-line bg-panel">
            <div className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <h2 className="font-semibold">{s.name}</h2>
                <p className="mt-1 text-sm">{s.purpose}</p>
                <p className="mt-1 text-sm text-fg-muted"><span className="text-fg">Receives: </span>{s.dataShared}</p>
                {s.notes ? <p className="mt-1 text-xs text-fg-muted">{s.notes}</p> : null}
              </div>
              <div className="flex flex-wrap content-start gap-1.5 lg:max-w-xs lg:justify-end">
                <Badge tone={s.dpaInPlace ? "green" : "amber"}>{s.dpaInPlace ? `Agreement${s.dpaDate ? ` ${formatDate(s.dpaDate)}` : " in place"}` : "No agreement recorded"}</Badge>
                <Badge tone={s.location ? "neutral" : "amber"}>{s.location ? `Stored: ${s.location}` : "Location not confirmed"}</Badge>
                {s.outsideUk === true ? <Badge tone={s.safeguards ? "neutral" : "red"}>Leaves the UK{s.safeguards ? `: ${s.safeguards}` : ", no safeguard"}</Badge> : s.outsideUk === false ? <Badge>Stays in the UK</Badge> : null}
                {s.noTraining === true ? <Badge tone="green">No training on our data</Badge> : s.noTraining === false ? <Badge tone="red">May train on our data</Badge> : null}
              </div>
            </div>
            <details className="border-t border-line">
              <summary className="cursor-pointer px-5 py-2.5 text-sm text-fg-muted">Edit</summary>
              <div className="grid gap-4 px-5 pb-5">
                <SupplierForm
                  s={{ id: s.id, name: s.name, purpose: s.purpose, dataShared: s.dataShared, location: s.location, outsideUk: s.outsideUk, safeguards: s.safeguards, dpaInPlace: s.dpaInPlace, dpaDate: s.dpaDate ? s.dpaDate.toISOString().slice(0, 10) : null, noTraining: s.noTraining, notes: s.notes }}
                />
                <form action={deleteSupplier}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="text-xs text-red-text underline">Remove {s.name} from the register</button>
                </form>
              </div>
            </details>
          </li>
        ))}
      </ul>

      <details className="rounded-lg border border-dashed border-line-strong/60 bg-panel-sunk">
        <summary className="cursor-pointer px-5 py-3 text-sm font-semibold">Add a supplier</summary>
        <div className="px-5 pb-5"><SupplierForm /></div>
      </details>
    </>
  );
}
