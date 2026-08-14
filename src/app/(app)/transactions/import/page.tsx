import { cookies } from "next/headers";
import { requireSession } from "@/lib/requireSession";
import { ExcelImportWizard } from "@/components/ExcelImportWizard";
import { LITE_MODE_COOKIE, LITE_MODE_ON } from "@/lib/liteMode";

// Workflow Refinement Step C — Import Excel entry route. Auth follows the
// same pattern as every other page (requireSession real cryptographic
// check, not just middleware cookie-presence).
export default function ImportTransactionsPage() {
  requireSession();
  const liteMode = cookies().get(LITE_MODE_COOKIE)?.value === LITE_MODE_ON;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-text">Import Transaksi</h1>
        <p className="text-sm text-muted">
          Import dari CSV (mis. rekap bank) sebagai alternatif entry point ke Financial Transaction — hasil akhirnya sama persis dengan input manual.
        </p>
      </div>
      <ExcelImportWizard liteMode={liteMode} />
    </div>
  );
}
