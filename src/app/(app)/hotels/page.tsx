import { createClient, requireProfile } from "@/lib/supabase/server";
import { DirectoryManager } from "@/components/directory/directory-manager";
import { PageHeader } from "@/components/page-header";
import { ISTANBUL_DISTRICT_OPTIONS } from "@/lib/istanbul";

export const metadata = { title: "Hotels" };

export default async function HotelsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: hotels } = await supabase.from("hotels").select("*").order("name");

  return (
    <>
      <PageHeader title="Hotels" subtitle="Partner hotels for patient stays" />
      <DirectoryManager
        table="hotels"
        entityName="Hotel"
        isAdmin={profile.role === "admin"}
        rows={hotels ?? []}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "city", label: "District", type: "select", options: ISTANBUL_DISTRICT_OPTIONS },
          { key: "stars", label: "Stars", type: "number" },
          { key: "contact", label: "Contact" },
          { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
        ]}
      />
    </>
  );
}
