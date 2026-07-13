import { createClient, requireProfile } from "@/lib/supabase/server";
import { DirectoryManager } from "@/components/directory/directory-manager";
import { PageHeader } from "@/components/page-header";
import { ISTANBUL_DISTRICT_OPTIONS } from "@/lib/istanbul";

export const metadata = { title: "Hospitals" };

export default async function HospitalsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: hospitals }, { data: doctors }] = await Promise.all([
    supabase.from("hospitals").select("*").order("name"),
    supabase.from("doctors").select("*, hospitals(name)").order("name"),
  ]);
  const isAdmin = profile.role === "admin";
  const hospitalOptions = (hospitals ?? []).map((h) => ({ value: h.id as string, label: h.name as string }));

  return (
    <>
      <PageHeader title="Hospitals" subtitle="Partner hospitals, clinics and their doctors" />
      <DirectoryManager
        table="hospitals"
        entityName="Hospital"
        isAdmin={isAdmin}
        rows={hospitals ?? []}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "city", label: "District", type: "select", options: ISTANBUL_DISTRICT_OPTIONS },
          { key: "contact", label: "Contact" },
          { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
        ]}
      />

      <div className="mt-12 border-t border-border pt-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Doctors</h2>
          <p className="mt-1 text-sm text-muted">Surgeons and specialists, linked to their hospital</p>
        </div>
        <DirectoryManager
          table="doctors"
          entityName="Doctor"
          isAdmin={isAdmin}
          rows={doctors ?? []}
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "specialty", label: "Specialty" },
            {
              key: "hospital_id",
              label: "Hospital",
              type: "select",
              options: hospitalOptions,
              displayKey: "hospitals",
            },
            { key: "contact", label: "Contact", type: "tel" },
            { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
          ]}
        />
      </div>
    </>
  );
}
