import { notFound } from "next/navigation";
import { buildTransactionTrace } from "@/lib/trace";
import { TransactionTraceView } from "@/components/TransactionTraceView";

// Step 17 — Transaction Trace UI, entered via TRANSACTION id (the always-
// available entry point). PAYMENT/INVOICE/COST_DETAIL entry points (Step 8)
// are already served by GET /api/trace/[entryId]?entryType=... — wiring a
// UI entry point from Invoice/Cost Detail list screens is deferred until
// those screens themselves get built, not a gap in the trace logic itself.
export default async function TransactionTracePage({ params }: { params: { id: string } }) {
  const trace = await buildTransactionTrace(params.id).catch(() => null);
  if (!trace) notFound();

  return <TransactionTraceView trace={trace} matterHref={(id) => `/matters/${id}`} />;
}
