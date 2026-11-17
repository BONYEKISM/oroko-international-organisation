import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowDown, Building2, ShieldCheck } from "lucide-react";
import { OfficerCard } from "@/components/governance/OfficerCard";
import { ScrollReveal } from "@/components/governance/ScrollReveal";
import { getExecutiveCouncil } from "@/lib/dal/governance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Executive Council · OROKO INTERNATIONAL",
  description: "Meet the Interim Government and Executive Council of OROKO INTERNATIONAL.",
};

const COUNCIL_DESCRIPTION =
  "The Executive Council is responsible for implementing the resolutions of the General Assembly and managing the activities of OROKO INTERNATIONAL. Its officers serve in accordance with the organisation's Constitution and applicable governance decisions.";

export default async function ExecutivePage() {
  let council: Awaited<ReturnType<typeof getExecutiveCouncil>>;
  try {
    council = await getExecutiveCouncil();
  } catch (error) {
    console.error("[governance/executive] Failed to load council data", error);
    throw error;
  }
  const president = council.positions.find((position) => position.isPresident)
    ?? council.positions.find((position) => position.roleName.trim().toUpperCase() === "PRESIDENT");
  const otherPositions = council.positions
    .filter((position) => !position.isPresident && position.roleName.trim().toUpperCase() !== "PRESIDENT")
    .sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-oroko-warm-white">
      <header className="relative overflow-hidden bg-oroko-black text-white">
        <div aria-hidden="true" className="absolute inset-0 opacity-30">
          <div className="absolute -right-32 -top-56 size-136 rounded-full border border-oroko-gold/20" />
          <div className="absolute -right-16 -top-40 size-104 rounded-full border border-oroko-gold/15" />
          <div className="absolute -bottom-48 -left-32 size-120 rounded-full border border-oroko-green-light/30" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6 sm:pb-20 lg:px-8">
          <Link
            href="/governance"
            className="inline-flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-oroko-gold"
          >
            <ArrowLeft className="size-4" /> Governance
          </Link>

          <div className="mt-16 max-w-4xl sm:mt-20">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-oroko-gold/25 bg-white/4 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-oroko-gold">
              <ShieldCheck className="size-3.5" />
              Interim Government
            </div>
            <h1 className="font-heading text-5xl font-semibold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
              Executive <span className="text-oroko-gold">Council</span>
            </h1>
            <a
              href="#council"
              className="mt-7 inline-flex items-center gap-2 border-b border-oroko-gold/50 pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/75 transition-colors hover:text-oroko-gold"
            >
              Meet the Council <ArrowDown className="size-3.5" />
            </a>
          </div>
          <div className="absolute bottom-0 right-8 hidden items-center gap-3 pb-8 text-[10px] uppercase tracking-[0.2em] text-white/35 lg:flex">
            <Building2 className="size-4 text-oroko-gold/70" />
            Governance &amp; leadership
          </div>
        </div>
      </header>

      <div id="council" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <section className="mb-12 grid gap-8 border-b border-border/80 pb-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="max-w-3xl">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-oroko-gold">Mandate &amp; service</p>
            <h2 className="font-heading text-3xl font-semibold leading-tight text-oroko-black sm:text-4xl">
              Executive Council mandate
            </h2>
            <p className="mt-4 leading-7 text-muted-foreground">{COUNCIL_DESCRIPTION}</p>
          </div>
          <div className="inline-flex w-fit items-center gap-3 rounded-sm border border-oroko-gold/20 bg-white px-4 py-3 text-sm text-oroko-black shadow-sm">
            <span className="flex size-9 items-center justify-center rounded-full bg-oroko-gold/10 text-oroko-gold">
              <ShieldCheck className="size-4" />
            </span>
            <span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current administration</span>
              <span className="mt-0.5 block font-medium">Interim Government</span>
            </span>
          </div>
        </section>

        <ScrollReveal className="mb-16">
          <section aria-labelledby="president-heading">
            <div className="mb-5 flex items-center gap-3">
              <span className="h-px w-8 bg-oroko-gold" />
              <p id="president-heading" className="text-[10px] font-semibold uppercase tracking-[0.24em] text-oroko-gold">
                Office of the President
              </p>
            </div>
            <OfficerCard
              officer={president?.officer}
              roleName={president?.roleName ?? "PRESIDENT"}
              responsibilities={president?.responsibilities}
              description={president?.description}
              hasUnpublishedOfficer={president?.hasUnpublishedOfficer}
              featured
              presidentialMessage={council.presidentMessage}
            />
          </section>
        </ScrollReveal>

        <ScrollReveal>
          <section aria-labelledby="officers-heading">
            <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-oroko-gold">The Interim Government</p>
                <h2 id="officers-heading" className="font-heading text-3xl font-semibold text-oroko-black sm:text-4xl">
                  Council officers
                </h2>
              </div>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Select an officer to read their approved profile and portfolio.
              </p>
            </div>

            {otherPositions.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border bg-white px-6 py-14 text-center">
                <Building2 className="mx-auto mb-4 size-8 text-oroko-gold/70" strokeWidth={1.4} />
                <p className="font-heading text-xl font-semibold text-oroko-black">No additional positions are currently published</p>
                <p className="mt-2 text-sm text-muted-foreground">Council positions will appear here when made active.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {otherPositions.map((position) => (
                  <OfficerCard
                    key={position.id}
                    roleName={position.roleName}
                    officer={position.officer}
                    responsibilities={position.responsibilities}
                    description={position.description}
                    hasUnpublishedOfficer={position.hasUnpublishedOfficer}
                  />
                ))}
              </div>
            )}
          </section>
        </ScrollReveal>
      </div>
    </div>
  );
}
