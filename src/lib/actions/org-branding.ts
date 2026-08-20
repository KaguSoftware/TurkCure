"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/server";
import { isHex6, relLuminance } from "@/lib/branding/color";

/**
 * Org branding writes. Admin-gated, and the org id ALWAYS comes from the
 * caller's own profile — never from a parameter — so no request can retarget
 * another workspace. Service role because organizations has no user write
 * policies (deliberately: these two actions are the only write path).
 */

function cleanText(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max);
}

export async function updateOrgBranding(fields: {
  name: string;
  company_name: string;
  whatsapp: string;
  website: string;
  url: string;
  location: string;
  address: string;
  tagline: string;
  brand_primary: string;
  pdf_cover_bg: string;
  pdf_cover_accent: string;
}): Promise<{ error?: string }> {
  const profile = await requireAdmin();

  const name = cleanText(fields.name, 80);
  if (!name) return { error: "Company name cannot be empty." };

  const url = cleanText(fields.url, 200);
  if (url && !/^https?:\/\//.test(url)) return { error: "Website link must start with http(s)://." };

  const colors = {
    brand_primary: String(fields.brand_primary ?? "").toLowerCase(),
    pdf_cover_bg: String(fields.pdf_cover_bg ?? "").toLowerCase(),
    pdf_cover_accent: String(fields.pdf_cover_accent ?? "").toLowerCase(),
  };
  for (const [key, value] of Object.entries(colors)) {
    if (!isHex6(value)) return { error: `Invalid color for ${key.replace(/_/g, " ")}.` };
  }
  // One check that removes the whole light-cover-unreadable-text failure class:
  // the cover paints near-white text on this ground.
  if (relLuminance(colors.pdf_cover_bg) > 0.35)
    return { error: "Choose a darker cover color — the cover prints light text on it." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({
      name,
      company_name: cleanText(fields.company_name, 120) || name,
      whatsapp: cleanText(fields.whatsapp, 60),
      website: cleanText(fields.website, 120),
      url,
      location: cleanText(fields.location, 120),
      address: cleanText(fields.address, 300),
      tagline: cleanText(fields.tagline, 120),
      ...colors,
    })
    .eq("id", profile.org_id);
  if (error) return { error: error.message };

  revalidateTag(`org:${profile.org_id}`, "max");
  // The shell (accent, brand slot) and every PDF entry point read the org row.
  revalidatePath("/", "layout");
  return {};
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
// PNG/JPG only — the logo flows into react-pdf <Image>, which does not decode
// WebP/GIF/SVG (unlike the browser-only avatar).
const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
};

export async function updateOrgLogo(formData: FormData): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "No image selected." };
  const ext = LOGO_TYPES[file.type];
  if (!ext) return { error: "Use a PNG or JPG image — PDFs cannot embed other formats." };
  if (file.size > MAX_LOGO_BYTES) return { error: "Image must be under 2 MB." };

  const admin = createAdminClient();
  // Unique path per upload so stale CDN caches never show the old logo.
  const path = `${profile.org_id}/logo-${Date.now()}.${ext}`;
  const { error: uploadError } = await admin.storage
    .from("org-assets")
    .upload(path, file, { contentType: file.type });
  if (uploadError) return { error: uploadError.message };

  const { data } = admin.storage.from("org-assets").getPublicUrl(path);
  const { error } = await admin
    .from("organizations")
    .update({ logo_url: data.publicUrl })
    .eq("id", profile.org_id);
  if (error) return { error: error.message };

  await removeLogoFiles(profile.org_id, path);
  revalidateTag(`org:${profile.org_id}`, "max");
  revalidatePath("/", "layout");
  return {};
}

export async function removeOrgLogo(): Promise<{ error?: string }> {
  const profile = await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ logo_url: null })
    .eq("id", profile.org_id);
  if (error) return { error: error.message };
  await removeLogoFiles(profile.org_id);
  revalidateTag(`org:${profile.org_id}`, "max");
  revalidatePath("/", "layout");
  return {};
}

/** Best-effort cleanup of this org's logo files, optionally keeping one. */
async function removeLogoFiles(orgId: string, keep?: string) {
  const admin = createAdminClient();
  const { data: files } = await admin.storage.from("org-assets").list(orgId);
  const stale = (files ?? [])
    .map((f) => `${orgId}/${f.name}`)
    .filter((p) => p !== keep && p.includes("/logo-"));
  if (stale.length) await admin.storage.from("org-assets").remove(stale);
}
