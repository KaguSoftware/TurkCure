import { createClient, requireProfile } from "@/lib/supabase/server";
import { DirectoryManager } from "@/components/directory/directory-manager";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Doctors" };

export default async function DoctorsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: doctors }, { data: hospitals }] = await Promise.all([
    supabase.from("doctors").select("*, hospitals(name)").order("name"),
    supabase.from("hospitals").select("id, name").order("name"),
  ]);

  return (
    <>
      <PageHeader title="Doctors" subtitle="Surgeons and specialists" />
      <DirectoryManager
        table="doctors"
        entityName="Doctor"
        isAdmin={profile.role === "admin"}
        rows={doctors ?? []}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "specialty", label: "Specialty" },
          {
            key: "hospital_id",
            label: "Hospital",
            type: "select",
            options: (hospitals ?? []).map((h) => ({ value: h.id, label: h.name })),
            render: (row) =>
              ((row as { hospitals?: { name: string } | null }).hospitals?.name ?? "—"),
          },
          { key: "contact", label: "Contact" },
          { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
        ]}
      />
    </>
  );
}
