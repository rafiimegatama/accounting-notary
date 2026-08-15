// Centralized copy for the "(?)" contextual-help affordance
// (`src/components/ui/FieldHelp.tsx`). One key per field — components must
// never hand-write this copy inline, so there is exactly one source of
// truth per CODING_STANDARD.md's "no hardcoded financial values" spirit
// (this isn't a financial value, but the same duplication concern applies
// to explanatory copy). Validated verbatim with the office accountant —
// do not rewrite/improve the wording here without re-validating.
export const FIELD_HELP = {
  costAmount:
    "Nilai biaya yang dibebankan kepada client untuk matter ini — bukan jumlah uang yang sudah dikeluarkan kantor kepada pihak ketiga.",
  financialType:
    "Menentukan klasifikasi transaksi dalam financial control. Jika belum jelas, biarkan Unclassified dan jangan menebak.",
  sourceType:
    "Menunjukkan dari mana informasi transaksi berasal, misalnya bank statement, Excel, WhatsApp, atau input manual.",
  sourceReference:
    "Referensi asal transaksi, seperti nama file, nomor dokumen, atau keterangan sumber yang membantu penelusuran kembali.",
  allocationAmount:
    "Bagian dari payment yang dialokasikan ke invoice ini. Satu payment dapat dialokasikan ke lebih dari satu invoice.",
  allowPartialPayment:
    "Menentukan apakah invoice boleh dibayar sebagian. Jika diizinkan, pembayaran sebagian tidak otomatis dianggap sebagai masalah.",
  deposit:
    "Gunakan untuk dana yang memang diterima sebagai titipan client untuk keperluan tertentu. Jangan gunakan hanya karena transaksi berkaitan dengan PNBP atau BPHTB.",
  depositUsed:
    "Total seluruh transaksi yang diklasifikasikan Disbursement untuk matter ini — bukan hanya dana yang diambil dari deposit yang diterima. Matter tanpa deposit sekalipun bisa punya angka ini kalau ada disbursement tercatat.",
  invoiceTotal: "Total nilai yang dibebankan kepada client melalui invoice ini.",
  paymentAmount:
    "Jumlah uang yang diterima pada transaksi payment ini. Pengalokasian ke invoice dicatat secara terpisah.",
  linkStatus:
    "Menunjukkan apakah transaksi sudah terhubung ke client atau matter. Unlinked tetap merupakan status yang valid jika kepemilikan belum diketahui.",
  reviewStatus:
    "Menunjukkan apakah transaksi membutuhkan perhatian manusia. Status ini bersifat advisory dan tidak otomatis memblokir proses.",
} as const;
