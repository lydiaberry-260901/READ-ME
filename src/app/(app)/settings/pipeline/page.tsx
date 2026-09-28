import { requireCapability } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { AddStageForm, StageRow } from "./StageForms";
import { moveStage } from "./actions";

export const metadata = { title: "Deal stages" };

const kindLabel = { OPEN: "Open", WON: "Closes as won", LOST: "Closes as lost" } as const;

export default async function PipelineSettingsPage() {
  const user = await requireCapability("settings.manage");
  const pipeline = await prisma.pipeline.findFirstOrThrow({
    where: { organisationId: user.organisationId, isDefault: true },
    include: { stages: { where: { archived: false }, orderBy: { position: "asc" }, include: { _count: { select: { deals: true } } } } },
  });
  return (
    <>
      <PageHeader title="Deal stages" description="Add, rename, reorder and recolour the stages on the deal board. The chance of winning is used for expected income." />
      <ol className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
        {pipeline.stages.map((s, i) => (
          <li key={s.id} className="grid gap-4 p-4 lg:grid-cols-[12rem_1fr]">
            <div className="flex items-start gap-3">
              <div className="flex flex-col">
                <form action={moveStage}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="direction" value="up" />
                  <button type="submit" disabled={i === 0} className="rounded px-1.5 text-fg-muted hover:bg-panel-raised disabled:opacity-30" aria-label={`Move ${s.name} up`}>▲</button>
                </form>
                <form action={moveStage}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="direction" value="down" />
                  <button type="submit" disabled={i === pipeline.stages.length - 1} className="rounded px-1.5 text-fg-muted hover:bg-panel-raised disabled:opacity-30" aria-label={`Move ${s.name} down`}>▼</button>
                </form>
              </div>
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-fg-muted">{kindLabel[s.kind]}, {s._count.deals} deals</p>
              </div>
            </div>
            <StageRow stage={{ id: s.id, name: s.name, colour: s.colour, probability: s.probability, noActivityDays: s.noActivityDays, kind: s.kind }} />
          </li>
        ))}
      </ol>
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Add a stage</h2>
        <AddStageForm />
      </section>
    </>
  );
}
