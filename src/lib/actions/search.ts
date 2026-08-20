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

  const [patients, cases, hospitals, doctors, hotels, drivers] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, email, phone, status")
      .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(8),
    supabase
      .from("cases")
      .select("id, protocol_number, patient_id, patients(full_name)")
      .ilike("protocol_number", like)
      .limit(4),
    supabase.from("hospitals").select("id, name, city").ilike("name", like).limit(4),
    supabase.from("doctors").select("id, name, specialty").ilike("name", like).limit(4),
    supabase.from("hotels").select("id, name, city").ilike("name", like).limit(4),
    supabase.from("drivers").select("id, name, phone").ilike("name", like).limit(4),
  ]);

  // A protocol-number hit points at one specific case, so it wins over the plain
  // patient row when a numeric query matches both a phone and a protocol number.
  // `id` is the case id, not the patient's — a patient can have two matching
  // cases, and the palette keys its rows by kind + id.
  const caseHits = (cases.data ?? []).map((c) => {
    const p = c.patients as unknown as { full_name: string } | null;
    return {
      kind: "patient" as const,
      id: c.id,
      title: p?.full_name ?? "Case",
      subtitle: `Protocol ${c.protocol_number}`,
      // ?case= selects that case; the Case & Quote tab is already the default.
      href: `/patients/${c.patient_id}?case=${c.id}`,
    };
  });
  const caseHitPatients = new Set((cases.data ?? []).map((c) => c.patient_id));

  const results: SearchResult[] = [
    ...caseHits,
    ...(patients.data ?? [])
      .filter((p) => !caseHitPatients.has(p.id))
      .map((p) => ({
        kind: "patient" as const,
        id: p.id,
        title: p.full_name,
        subtitle: [p.status, p.email || p.phone].filter(Boolean).join(" · "),
        href: `/patients/${p.id}`,
      })),
    // Directory hits carry ?q= (+ &t= naming the table on pages that host two
    // managers) so the landing page opens already filtered to the result,
    // instead of dumping the user on an unfiltered list.
    ...(hospitals.data ?? []).map((h) => ({
      kind: "hospital" as const,
      id: h.id,
      title: h.name,
      subtitle: h.city || "Hospital",
      href: `/hospitals?q=${encodeURIComponent(h.name)}&t=hospitals`,
    })),
    ...(doctors.data ?? []).map((d) => ({
      kind: "doctor" as const,
      id: d.id,
      title: d.name,
      subtitle: d.specialty || "Doctor",
      href: `/hospitals?q=${encodeURIComponent(d.name)}&t=doctors`,
    })),
    ...(hotels.data ?? []).map((h) => ({
      kind: "hotel" as const,
      id: h.id,
      title: h.name,
      subtitle: h.city || "Hotel",
      href: `/hotels?q=${encodeURIComponent(h.name)}`,
    })),
    ...(drivers.data ?? []).map((d) => ({
      kind: "driver" as const,
      id: d.id,
      title: d.name,
      subtitle: d.phone || "Driver",
      href: `/drivers?q=${encodeURIComponent(d.name)}`,
    })),
  ];

  return { results };
}
