"use server";

import { createClient, requireProfile } from "@/lib/supabase/server";

export interface SearchResult {
  kind: "patient" | "hospital" | "doctor" | "hotel" | "driver";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Case-insensitive search across patients and all directories, for the command palette. */
export async function globalSearch(query: string): Promise<{ results: SearchResult[]; error?: string }> {
  await requireProfile();
  const q = query.trim();
  if (q.length < 2) return { results: [] };
  const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
  const supabase = await createClient();

  const [patients, hospitals, doctors, hotels, drivers] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, email, phone, status")
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(8),
    supabase.from("hospitals").select("id, name, city").ilike("name", like).limit(4),
    supabase.from("doctors").select("id, name, specialty").ilike("name", like).limit(4),
    supabase.from("hotels").select("id, name, city").ilike("name", like).limit(4),
    supabase.from("drivers").select("id, name, phone").ilike("name", like).limit(4),
  ]);

  const results: SearchResult[] = [
    ...(patients.data ?? []).map((p) => ({
      kind: "patient" as const,
      id: p.id,
      title: p.full_name,
      subtitle: [p.status, p.email || p.phone].filter(Boolean).join(" · "),
      href: `/patients/${p.id}`,
    })),
    ...(hospitals.data ?? []).map((h) => ({
      kind: "hospital" as const,
      id: h.id,
      title: h.name,
      subtitle: h.city || "Hospital",
      href: "/hospitals",
    })),
    ...(doctors.data ?? []).map((d) => ({
      kind: "doctor" as const,
      id: d.id,
      title: d.name,
      subtitle: d.specialty || "Doctor",
      href: "/hospitals",
    })),
    ...(hotels.data ?? []).map((h) => ({
      kind: "hotel" as const,
      id: h.id,
      title: h.name,
      subtitle: h.city || "Hotel",
      href: "/hotels",
    })),
    ...(drivers.data ?? []).map((d) => ({
      kind: "driver" as const,
      id: d.id,
      title: d.name,
      subtitle: d.phone || "Driver",
      href: "/drivers",
    })),
  ];

  return { results };
}
