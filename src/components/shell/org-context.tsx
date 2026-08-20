"use client";

import * as React from "react";
import Link from "next/link";

/**
 * The current org's display identity for client components (copy like
 * "patient pays {org}", CSV filenames, the drawer brand slot) — provided once
 * by the app layout so nothing has to prop-drill it through the tab shells.
 */
export interface OrgInfo {
  name: string;
  logoUrl: string | null;
}

const OrgContext = React.createContext<OrgInfo>({ name: "TurkCure", logoUrl: null });

export function OrgProvider({ value, children }: { value: OrgInfo; children: React.ReactNode }) {
  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgInfo {
  return React.useContext(OrgContext);
}

/** The brand slot in the sidebar / mobile drawer: logo image when the org has
 *  one, else the org name in the brand gradient (which tracks the org accent). */
export function OrgBrand({ onClick }: { onClick?: () => void }) {
  const org = useOrg();
  return (
    <Link href="/dashboard" onClick={onClick} className="text-lg font-bold tracking-tight">
      {org.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL, small logo
        <img src={org.logoUrl} alt={org.name} className="h-7 w-auto max-w-40 object-contain" />
      ) : (
        <span className="brand-gradient-text">{org.name}</span>
      )}
    </Link>
  );
}
