import { createClient, requireProfile } from "@/lib/supabase/server";
import { DirectoryManager } from "@/components/directory/directory-manager";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Instruction Templates" };

export default async function TemplatesPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const [{ data: templates }, { data: operationTypes }] = await Promise.all([
    supabase.from("instruction_templates").select("*, operation_types(name)").order("title"),
    supabase.from("operation_types").select("id, name").order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="Instruction Templates"
        subtitle="Reusable patient instructions per operation — attached to cases and included in the patient PDF"
      />
      <DirectoryManager
        table="instruction_templates"
        entityName="Template"
        isAdmin={profile.role === "admin"}
        rows={templates ?? []}
        fields={[
          { key: "title", label: "Title", required: true },
          {
            key: "operation_type_id",
            label: "Operation",
            type: "select",
            options: (operationTypes ?? []).map((o) => ({ value: o.id, label: o.name })),
            displayKey: "operation_types",
          },
          { key: "body_md", label: "Instructions (Markdown)", type: "markdown", hideInTable: true },
        ]}
      />
    </>
  );
}
