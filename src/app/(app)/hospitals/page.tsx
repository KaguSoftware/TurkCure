import { createClient, requireProfile } from "@/lib/supabase/server";
import { DirectoryManager } from "@/components/directory/directory-manager";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Hospitals" };

export default async function HospitalsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: hospitals } = await supabase.from("hospitals").select("*").order("name");

  return (
    <>
      <PageHeader title="Hospitals" subtitle="Partner hospitals and clinics" />
      <DirectoryManager
        table="hospitals"
        entityName="Hospital"
        isAdmin={profile.role === "admin"}
        rows={hospitals ?? []}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "city", label: "City" },
          { key: "contact", label: "Contact" },
          { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
        ]}
      />
    </>
  );
}
