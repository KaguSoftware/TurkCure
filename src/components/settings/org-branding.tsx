"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { DraftBanner } from "@/components/ui/draft-banner";
import { toast } from "@/components/ui/toast";
import { useFormDraft } from "@/lib/use-form-draft";
import { updateOrgBranding, updateOrgLogo, removeOrgLogo } from "@/lib/actions/org-branding";
import { darken, mix, relLuminance } from "@/lib/branding/color";
import type { Organization } from "@/lib/types";

type Colors = { brand_primary: string; pdf_cover_bg: string; pdf_cover_accent: string };

/**
 * The Organization tab (admin): company identity, the fields printed on the
 * patient-facing PDFs, the logo, and the three brand colors — with a live
 * preview derived through the same lib/branding/color helpers the PDF theme
 * and the app accent use, so what the chips show is what ships.
 */
export function OrgBrandingTab({ org }: { org: Organization }) {
  return (
    <div className="space-y-4">
      <LogoCard org={org} />
      <BrandingForm org={org} />
    </div>
  );
}

function LogoCard({ org }: { org: Organization }) {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("logo", file);
    const r = await updateOrgLogo(fd);
    setBusy(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Logo updated.");
      React.startTransition(() => router.refresh());
    }
  }

  async function onRemove() {
    setBusy(true);
    const r = await removeOrgLogo();
    setBusy(false);
    if (r.error) toast.error(r.error);
    else {
      toast.success("Logo removed.");
      React.startTransition(() => router.refresh());
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        {org.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL
          <img
            src={org.logo_url}
            alt={`${org.name} logo`}
            className="h-12 w-auto max-w-48 rounded-md border border-border bg-white object-contain p-1"
          />
        ) : (
          <div className="brand-gradient-bg flex h-12 w-24 items-center justify-center rounded-md text-sm font-semibold text-white">
            {org.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={onPick}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            pending={busy}
            disabled={busy}
          >
            <Upload /> Upload logo
          </Button>
          {org.logo_url && (
            <Button variant="ghost" onClick={onRemove} disabled={busy}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
        <p className="w-full text-xs text-muted">
          PNG or JPG, under 2 MB — appears in the app sidebar and on every PDF (cover and page
          headers). Without one, the company name renders as a text mark.
        </p>
      </CardContent>
    </Card>
  );
}

function BrandingForm({ org }: { org: Organization }) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [colors, setColors] = React.useState<Colors>({
    brand_primary: org.brand_primary,
    pdf_cover_bg: org.pdf_cover_bg,
    pdf_cover_accent: org.pdf_cover_accent,
  });

  const draft = useFormDraft(`org:${org.id}`, {
    onRestore: (fields) =>
      setColors((c) => ({
        brand_primary: (fields.brand_primary as string) || c.brand_primary,
        pdf_cover_bg: (fields.pdf_cover_bg as string) || c.pdf_cover_bg,
        pdf_cover_accent: (fields.pdf_cover_accent as string) || c.pdf_cover_accent,
      })),
    onDiscard: () =>
      setColors({
        brand_primary: org.brand_primary,
        pdf_cover_bg: org.pdf_cover_bg,
        pdf_cover_accent: org.pdf_cover_accent,
      }),
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const text = (name: string) => String(fd.get(name) ?? "");
    const r = await updateOrgBranding({
      name: text("name"),
      company_name: text("company_name"),
      whatsapp: text("whatsapp"),
      website: text("website"),
      url: text("url"),
      location: text("location"),
      address: text("address"),
      tagline: text("tagline"),
      brand_primary: colors.brand_primary,
      pdf_cover_bg: colors.pdf_cover_bg,
      pdf_cover_accent: colors.pdf_cover_accent,
    });
    setSaving(false);
    if (r.error) toast.error(r.error);
    else {
      draft.clear();
      toast.success("Branding saved.");
      React.startTransition(() => router.refresh());
    }
  }

  const colorField = (label: string, key: keyof Colors, hint: string) => (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          name={key}
          value={colors[key]}
          onChange={(e) => setColors((c) => ({ ...c, [key]: e.target.value }))}
          className="h-9 w-14 cursor-pointer rounded-md border border-border bg-surface p-1"
        />
        <span className="font-mono text-xs text-muted">{colors[key]}</span>
      </div>
    </Field>
  );

  return (
    <form key={draft.formKey} ref={draft.formRef} onSubmit={onSubmit} className="space-y-4">
      <DraftBanner draft={draft} />

      <Card>
        <CardHeader>
          <CardTitle>Identity &amp; documents</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Display name" hint="Shown in the app sidebar and window titles">
            <Input name="name" required defaultValue={draft.value("name") ?? org.name} />
          </Field>
          <Field label="Printed company name" hint="Heads the company block on PDFs">
            <Input
              name="company_name"
              defaultValue={draft.value("company_name") ?? org.company_name}
              placeholder={org.name}
            />
          </Field>
          <Field label="Cover tagline" hint="Small line under the logo on the PDF cover">
            <Input name="tagline" defaultValue={draft.value("tagline") ?? org.tagline} />
          </Field>
          <Field label="WhatsApp">
            <Input name="whatsapp" defaultValue={draft.value("whatsapp") ?? org.whatsapp} />
          </Field>
          <Field label="Website (shown)" hint='Display form, e.g. "Example.com"'>
            <Input name="website" defaultValue={draft.value("website") ?? org.website} />
          </Field>
          <Field label="Website link" hint="Full https:// address, printed in the PDF footer">
            <Input name="url" defaultValue={draft.value("url") ?? org.url} />
          </Field>
          <Field label="Location" hint="Short form, e.g. district and city">
            <Input name="location" defaultValue={draft.value("location") ?? org.location} />
          </Field>
          <Field label="Postal address" hint="Printed in the PDF footer">
            <Input name="address" defaultValue={draft.value("address") ?? org.address} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Colors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {colorField("Brand color", "brand_primary", "App accent + PDF links and headings")}
            {colorField("PDF cover", "pdf_cover_bg", "Cover ground and section bands — keep it dark")}
            {colorField("PDF cover accent", "pdf_cover_accent", "Rules, bullets and highlights")}
          </div>
          <ColorPreview colors={colors} orgName={org.name} tagline={org.tagline} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" pending={saving} disabled={saving}>
          <Save /> Save branding
        </Button>
      </div>
    </form>
  );
}

/** Derived-shade chips + a miniature PDF cover, computed with the exact same
 *  helpers the PDF theme and app accent use — the preview IS the derivation. */
function ColorPreview({
  colors,
  orgName,
  tagline,
}: {
  colors: Colors;
  orgName: string;
  tagline: string;
}) {
  const p = colors.brand_primary;
  const a = colors.pdf_cover_accent;
  const chips: [string, string][] = [
    ["Accent", p],
    ["Hover", darken(p, 0.15)],
    ["Soft", mix(p, "#ffffff", 0.92)],
    ["Cover accent", a],
    ["Light", mix(a, "#ffffff", 0.35)],
    ["Dark", darken(a, 0.3)],
  ];
  return (
    <div className="flex flex-wrap items-stretch gap-4">
      <div className="flex flex-1 flex-wrap content-start gap-2">
        {chips.map(([label, hex]) => (
          <div key={label} className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
            <span className="size-4 rounded-sm border border-border" style={{ background: hex }} />
            <span className="text-xs text-muted">{label}</span>
          </div>
        ))}
        <span
          className="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium"
          style={{ background: p, color: relLuminance(p) > 0.55 ? "#0f172a" : "#ffffff" }}
        >
          Sample button
        </span>
      </div>
      {/* Miniature cover: ground + accent frame + name/tagline, mirroring the
          real CoverPage composition. */}
      <div
        className="flex h-40 w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-md p-2"
        style={{ background: colors.pdf_cover_bg }}
      >
        <div
          className="flex size-full flex-col items-center justify-center gap-1 rounded-sm border p-2 text-center"
          style={{ borderColor: a }}
        >
          <span className="text-[11px] font-bold leading-tight" style={{ color: "#f5f1e6" }}>
            {orgName}
          </span>
          <span className="text-[7px] uppercase tracking-widest" style={{ color: mix(a, "#ffffff", 0.35) }}>
            {tagline || "Tagline"}
          </span>
          <span className="mt-1 h-px w-8" style={{ background: a }} />
          <span className="text-[7px]" style={{ color: mix(a, "#ffffff", 0.35) }}>
            Prepared for
          </span>
        </div>
      </div>
    </div>
  );
}
