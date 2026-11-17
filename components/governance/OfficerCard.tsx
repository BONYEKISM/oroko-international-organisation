"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Mail, Phone, UserRound } from "lucide-react";
import "./country-flags.css";
import type { OfficerProfile } from "@/lib/dal/governance";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  officer?: OfficerProfile;
  roleName?: string;
  responsibilities?: string[];
  description?: string;
  hasUnpublishedOfficer?: boolean;
  featured?: boolean;
  presidentialMessage?: string;
};

function termLabel(officer: OfficerProfile) {
  let dateRange: string | undefined;
  const format = (value: string) =>
    new Intl.DateTimeFormat("en", { year: "numeric", month: "short", timeZone: "UTC" })
      .format(new Date(value));
  if (officer.startDate && officer.endDate) {
    dateRange = `${format(officer.startDate)} – ${format(officer.endDate)}`;
  } else if (officer.startDate) {
    dateRange = `Since ${format(officer.startDate)}`;
  } else if (officer.endDate) {
    dateRange = `Until ${format(officer.endDate)}`;
  }

  if (officer.term && dateRange) return `Term: ${officer.term} · ${dateRange}`;
  if (officer.term) return `Term: ${officer.term}`;
  return dateRange;
}

function CountryIdentity({
  officer,
  featured = false,
}: {
  officer: OfficerProfile;
  featured?: boolean;
}) {
  if (!officer.countryCode || !officer.countryName) return null;

  return (
    <span
      className={`council-country group/country inline-flex items-center gap-1.5 font-sans text-[10px] font-medium leading-none tracking-normal transition-transform duration-300 ease-out motion-reduce:transition-none ${
        featured
          ? "text-white/60 group-hover/featured:translate-x-0.5 motion-reduce:translate-x-0"
          : "text-muted-foreground group-hover:translate-x-0.5"
      }`}
    >
      <span
        aria-hidden="true"
        className={`flag:${officer.countryCode} council-country-flag transition-transform duration-300 ease-out group-hover/country:scale-105 motion-reduce:transition-none motion-reduce:scale-100`}
      />
      {officer.countryName}
    </span>
  );
}

function Portrait({
  officer,
  featured,
}: {
  officer?: OfficerProfile;
  featured: boolean;
}) {
  const photoUrl = officer?.userPhoto;
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string>();

  if (photoUrl && failedPhotoUrl !== photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={`${officer.userName}, ${officer.roleName}`}
        fill
        sizes={featured ? "(max-width: 768px) 100vw, 42vw" : "(max-width: 640px) 100vw, 33vw"}
        className="object-cover transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:scale-100"
        unoptimized
        onError={() => setFailedPhotoUrl(photoUrl)}
      />
    );
  }
  return (
    <div className={`flex h-full w-full flex-col items-center justify-center gap-3 bg-linear-to-br from-oroko-green to-oroko-black ${featured ? "text-oroko-gold/60" : "text-white/45"}`}>
      <UserRound className={featured ? "size-24" : "size-12"} strokeWidth={1} aria-hidden="true" />
      <span className="text-[9px] font-medium uppercase tracking-[0.18em]">
        {photoUrl ? "Portrait unavailable" : officer ? "Portrait forthcoming" : "Awaiting appointment"}
      </span>
    </div>
  );
}

function OfficerCardContent({
  officer,
  roleName,
  responsibilities,
  description,
  hasUnpublishedOfficer = false,
  featured = false,
  presidentialMessage,
}: Props & { roleName: string }) {
  const term = officer ? termLabel(officer) : undefined;
  const isVacant = !officer && !hasUnpublishedOfficer;

  if (featured) {
    return (
      <div className="group/featured grid min-h-100 overflow-hidden rounded-sm border border-oroko-gold/25 bg-oroko-black shadow-[0_24px_70px_-35px_rgba(0,0,0,0.8)] md:grid-cols-[0.9fr_1.1fr]">
        <div className="group relative min-h-72 overflow-hidden bg-oroko-green">
          <Portrait officer={officer} featured />
          <div className="absolute inset-0 bg-linear-to-t from-oroko-black/50 via-transparent to-transparent" />
          <div className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full border border-oroko-gold/30 bg-oroko-black/65 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-oroko-gold backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-oroko-gold" />
            {officer ? "Serving leadership" : "Interim Government"}
          </div>
        </div>
        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-oroko-gold">
            PRESIDENT – CHIEF EXECUTIVE
          </p>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h2 className="font-heading text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
              {officer?.userName ?? (hasUnpublishedOfficer ? "Profile forthcoming" : "To be appointed")}
            </h2>
            {officer && <CountryIdentity officer={officer} featured />}
          </div>
          {term && <p className="mt-3 text-sm text-white/55">{term}</p>}
          <div className="my-6 h-px w-16 bg-oroko-gold/65" />
          <p className="whitespace-pre-line text-sm leading-7 text-white/70 sm:text-base">
            {presidentialMessage || "A presidential message has not yet been published."}
          </p>
          {!officer && (
            <p className="mt-5 text-xs uppercase tracking-[0.14em] text-white/45">
              {hasUnpublishedOfficer
                ? "The officer profile will appear when it is approved for publication."
                : "This leadership position is currently vacant."}
            </p>
          )}
          {officer?.bio && (
            <p className="mt-5 line-clamp-3 text-sm leading-6 text-white/50">{officer.bio}</p>
          )}
          {officer && (
            <span className="mt-7 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-oroko-gold">
              View presidential profile <ArrowUpRight className="size-3.5" />
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-sm border border-border bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-oroko-gold/35 hover:shadow-[0_18px_40px_-28px_rgba(20,30,20,0.45)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <div className="relative aspect-4/3 overflow-hidden bg-oroko-green">
        <Portrait officer={officer} featured={false} />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-oroko-black/65 to-transparent" />
        {term && (
          <span className="absolute bottom-3 left-4 text-[10px] font-medium uppercase tracking-[0.16em] text-white/85">
            {term}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-oroko-gold">{roleName}</p>
        <h3 className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-heading text-xl font-semibold leading-snug text-oroko-black">
          <span>{officer?.userName ?? (hasUnpublishedOfficer ? "Profile forthcoming" : "To be appointed")}</span>
          {officer && <CountryIdentity officer={officer} />}
        </h3>
        {description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{description}</p>}
        {!officer && (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {hasUnpublishedOfficer
              ? "The assigned officer profile is awaiting publication."
              : "This position is currently vacant."}
          </p>
        )}
        {responsibilities && responsibilities.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-border/70 pt-4">
            {responsibilities.slice(0, 3).map((responsibility) => (
              <li key={responsibility} className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-oroko-gold" />
                {responsibility}
              </li>
            ))}
          </ul>
        )}
        {officer && (
          <span className="mt-auto inline-flex items-center gap-1 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-oroko-green">
            View profile <ArrowUpRight className="size-3" />
          </span>
        )}
        {!officer && isVacant && <span className="mt-auto pt-5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Interim Government</span>}
      </div>
    </div>
  );
}

function OfficerDetails({ officer }: { officer: OfficerProfile }) {
  const term = termLabel(officer);
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="relative size-28 shrink-0 overflow-hidden rounded-sm bg-oroko-green">
          <Portrait officer={officer} featured={false} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-oroko-gold">{officer.roleName}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <DialogTitle className="font-heading text-2xl font-semibold text-oroko-black">{officer.userName}</DialogTitle>
            <CountryIdentity officer={officer} />
          </div>
          {term && <p className="mt-2 text-sm text-muted-foreground">{term}</p>}
        </div>
      </div>
      {officer.bio ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-oroko-black">Biography</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-7 text-muted-foreground">{officer.bio}</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">An approved biography has not been added yet.</p>
      )}
      {officer.roleDescription && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-oroko-black">Portfolio</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{officer.roleDescription}</p>
        </div>
      )}
      {officer.responsibilities.length > 0 && (
        <ul className="space-y-2">
          {officer.responsibilities.map((responsibility) => (
            <li key={responsibility} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-oroko-gold" />
              {responsibility}
            </li>
          ))}
        </ul>
      )}
      {(officer.email || officer.phone || officer.website || officer.linkedIn) && (
        <div className="flex flex-wrap gap-x-5 gap-y-3 border-t border-border pt-4 text-sm">
          {officer.email && <a className="inline-flex items-center gap-2 text-oroko-green hover:underline" href={`mailto:${officer.email}`}><Mail className="size-4" /> Email</a>}
          {officer.phone && <a className="inline-flex items-center gap-2 text-oroko-green hover:underline" href={`tel:${encodeURIComponent(officer.phone)}`}><Phone className="size-4" /> Call</a>}
          {officer.website && <a className="inline-flex items-center gap-2 text-oroko-green hover:underline" href={officer.website} target="_blank" rel="noreferrer">Website <ArrowUpRight className="size-3" /></a>}
          {officer.linkedIn && <a className="inline-flex items-center gap-2 text-oroko-green hover:underline" href={officer.linkedIn} target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight className="size-3" /></a>}
        </div>
      )}
    </div>
  );
}

export function OfficerCard(props: Props) {
  const roleName = props.roleName ?? props.officer?.roleName ?? "Executive Council";
  const content = <OfficerCardContent {...props} roleName={roleName} />;
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  if (!props.officer) {
    return <article aria-label={`${roleName}: ${props.hasUnpublishedOfficer ? "profile forthcoming" : "to be appointed"}`}>{content}</article>;
  }

  return (
    <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
      <div
        role="button"
        tabIndex={0}
        aria-label={`View ${props.officer.userName}, ${roleName}, profile`}
        className="group block h-full w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-oroko-gold"
        onClick={() => setIsProfileOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsProfileOpen(true);
          }
        }}
      >
        {content}
      </div>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogDescription>Executive Council officer profile</DialogDescription>
        </DialogHeader>
        <OfficerDetails officer={props.officer} />
      </DialogContent>
    </Dialog>
  );
}
