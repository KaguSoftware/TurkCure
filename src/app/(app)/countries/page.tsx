import { createClient, requireProfile } from "@/lib/supabase/server";
import { DirectoryManager } from "@/components/directory/directory-manager";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Countries" };

export default async function CountriesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data: countries } = await supabase.from("countries").select("*").order("name");

  return (
    <>
      <PageHeader title="Countries" subtitle="Patient origin countries" />
      <DirectoryManager
        table="countries"
        entityName="Country"
        isAdmin={profile.role === "admin"}
        rows={countries ?? []}
        fields={[
          { key: "name", label: "Name", required: true },
          { key: "code", label: "Code" },
        ]}
      />
    </>
  );
}
