import { PageHeader } from "@/components/page-header";
import { CsvImporter } from "@/components/patients/csv-importer";

export const metadata = { title: "Import Leads" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import Leads"
        subtitle="Upload a CSV, map the columns, preview, and import. Duplicates (matching email or phone) are skipped."
      />
      <CsvImporter />
    </>
  );
}
