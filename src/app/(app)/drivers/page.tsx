import { createClient, requireProfile } from "@/lib/supabase/server";
import { DirectoryManager } from "@/components/directory/directory-manager";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Drivers" };

export default async function DriversPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: drivers } = await supabase.from("drivers").select("*").order("name");

  return (
    <>
      <PageHeader title="Drivers" subtitle="Transfer drivers for airport and clinic runs" />
      <DirectoryManager
        table="drivers"
        entityName="Driver"
        isAdmin={profile.role === "admin"}
        rows={drivers ?? []}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "phone", label: "Phone", type: "tel" },
          { key: "vehicle", label: "Vehicle" },
          { key: "notes", label: "Notes", type: "textarea", hideInTable: true },
        ]}
      />
    </>
  );
}
