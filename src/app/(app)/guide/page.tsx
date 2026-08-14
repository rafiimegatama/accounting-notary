import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { getDashboardSummaryCards } from "@/lib/dashboard";

// Static "Panduan Alur Kerja" page — deliberately NOT a full interactive
// tour (popup-over-real-buttons). That was considered and rejected: this
// app's UI changes often (30+ CHANGELOG versions), so per-button coachmark
// selectors would be the most fragile, highest-maintenance thing in the
// codebase. This page gets 90% of the value at a fraction of the cost —
// real links into the real pages, kept in sync by hand like every other
// piece of static copy in the app (FIELD_HELP, EmptyState copy, etc.).
//
// UX approach, deliberately: progressive disclosure via native
// <details>/<summary> (zero JS, keyboard/screen-reader accessible for
// free, no new dependency) instead of dumping everything on screen at
// once — the person this is for (an accountant, not a developer) said
// explicitly she gets "pusing" (overwhelmed) by too much at once. Content
// mirrors src/app/(app)/page.tsx's NeedsAttention categories exactly
// (same tone colors, same hrefs) so this page never contradicts what she
// actually sees on the Dashboard.

const TONE_DOT: Record<string, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  default: "bg-primary",
};
const TONE_BADGE: Record<string, string> = {
  danger: "bg-danger-bg text-danger",
  warning: "bg-warning-bg text-warning",
  default: "bg-bg text-text",
};

const STEPS: { title: string; body: string; href: string; cta: string; secondaryHref?: string; secondaryCta?: string }[] = [
  {
    title: "1. Client & Matter baru",
    body: "Catat siapa client-nya dan urusan (Matter) apa yang sedang dikerjakan — misalnya AJB, SHM, atau Balik Nama. Belum ada uang yang bergerak di langkah ini.",
    href: "/clients",
    cta: "Buka halaman Clients & Matters",
  },
  {
    title: "2. Rincian Biaya ditambahkan",
    body: "Catat biaya-biaya yang akan dibebankan ke client untuk matter ini (biaya notaris, balik nama, dll). Ini yang nanti jadi dasar Invoice.",
    href: "/cost-details",
    cta: "Buka halaman Rincian Biaya",
  },
  {
    title: "3. Invoice dibuat",
    body: "Tagihan resmi ke client, dari total Rincian Biaya di atas. Selama belum dibayar, invoice ini akan tampil sebagai “Outstanding Invoice” — ini normal, bukan tanda ada yang salah.",
    href: "/invoices",
    cta: "Buka halaman Invoices",
  },
  {
    title: "4. Uang masuk dicatat (Transaction)",
    body: "Begitu client transfer, catat sebagai Transaction. Client/Matter-nya boleh diisi kalau sudah jelas, boleh dikosongkan dulu kalau belum jelas punya siapa — sistem tidak akan memaksa. Kalau transaksinya banyak sekaligus (misal dari bank statement), tidak perlu satu-satu — bisa Import CSV dari Excel.",
    href: "/transactions",
    cta: "Buka halaman Transactions",
    secondaryHref: "/transactions/import",
    secondaryCta: "atau Import CSV dari Excel",
  },
  {
    title: "5. Transaction diklasifikasi",
    body: "Tandai transaksi ini masuk kategori apa — biasanya Payment (pembayaran dari client). Bisa juga Deposit (titipan) atau Disbursement (uang keluar ke pihak ketiga).",
    href: "/transactions",
    cta: "Buka halaman Transactions",
  },
  {
    title: "6. Payment dialokasikan ke Invoice",
    body: "Pasangkan uang yang masuk ke invoice mana. Satu payment boleh dipecah ke beberapa invoice kalau memang untuk beberapa tagihan sekaligus.",
    href: "/payments",
    cta: "Buka halaman Payments",
  },
  {
    title: "7. Lunas",
    body: "Kalau jumlah yang dialokasikan pas dengan total invoice, invoice itu lunas dan otomatis hilang dari daftar Outstanding. Selesai.",
    href: "/invoices",
    cta: "Cek halaman Invoices",
  },
];

const ATTENTION = [
  {
    key: "review",
    tone: "danger",
    label: "Review Required",
    what: "Ada kejanggalan angka pada satu payment/invoice yang butuh dicek manusia.",
    why: "Muncul kalau (a) jumlah yang dialokasikan ke satu invoice melebihi total invoice-nya (overpayment), atau (b) invoice yang di-setting “tidak boleh dicicil” tapi yang dibayar baru sebagian.",
    action: "Buka detail transaksinya, telusuri kenapa selisih itu terjadi (lihat Skenario di bawah), lalu tentukan tindakannya — sistem tidak memutuskan otomatis.",
    href: "/review",
    cta: "Buka Review Center",
  },
  {
    key: "unlinked",
    tone: "warning",
    label: "Unlinked Transactions",
    what: "Uang masuk/keluar yang belum ditandai punya Client/Matter yang mana.",
    why: "Transaksi dicatat sebelum jelas siapa pemiliknya, atau memang sengaja dibiarkan dulu karena belum ada kepastian.",
    action: "Valid untuk dibiarkan kalau memang belum tahu punya siapa — jangan menebak. Isi begitu informasinya sudah jelas. Kalau unlinked-nya banyak sekaligus, tidak perlu satu-satu: centang beberapa (checkbox) di halaman Transactions, lalu assign Client/Matter bareng.",
    href: "/transactions?linked=unlinked",
    cta: "Lihat daftar Unlinked",
  },
  {
    key: "unallocated",
    tone: "warning",
    label: "Unallocated Payments",
    what: "Uang sudah masuk dan sudah ditandai Payment, tapi belum (atau belum sepenuhnya) dipasangkan ke invoice.",
    why: "Payment dibuat duluan, alokasi ke invoice belum sempat dilakukan.",
    action: "Buka payment-nya, pilih invoice yang sesuai, lalu alokasikan. Boleh dipecah ke lebih dari satu invoice.",
    href: "/payments?allocationStatus=UNALLOCATED",
    cta: "Lihat daftar Unallocated",
  },
  {
    key: "source",
    tone: "warning",
    label: "Source Pending",
    what: "Sumber informasi transaksinya belum diisi (bank statement? Excel? WhatsApp?).",
    why: "Transaksi dicatat cepat dulu, detail sumbernya menyusul.",
    action: "Lengkapi field Source begitu ada waktu — murni soal kelengkapan pencatatan, uangnya sendiri tidak bermasalah.",
    href: "/transactions?sourceType=SOURCE_PENDING",
    cta: "Lihat daftar Source Pending",
  },
  {
    key: "overdue",
    tone: "danger",
    label: "Overdue Invoices",
    what: "Invoice yang sudah lewat tanggal jatuh tempo dan masih ada sisa tagihan.",
    why: "Client belum bayar (atau belum lunas) sampai lewat tanggal yang dijanjikan.",
    action: "Follow up ke client. Ini satu-satunya kategori yang memang soal waktu/urgensi.",
    href: "/invoices?aging=overdue",
    cta: "Lihat daftar Overdue",
  },
  {
    key: "outstanding",
    tone: "default",
    label: "Outstanding Invoices",
    what: "Invoice yang masih ada sisa tagihan (belum tentu telat — mungkin memang belum jatuh tempo).",
    why: "Ini kondisi normal sehari-hari, bukan alarm — hampir semua invoice baru akan muncul di sini dulu sebelum lunas.",
    action: "Tidak perlu tindakan khusus, cuma informasi berapa yang masih outstanding. Akan otomatis hilang begitu lunas.",
    href: "/invoices?outstanding=1",
    cta: "Lihat daftar Outstanding",
  },
];

const SCENARIOS = [
  {
    title: "Order baru, belum dibayar",
    example: "Invoice Rp10.000.000 dibuat untuk PT ABC. Belum ada transfer masuk.",
    result: "Muncul sebagai Outstanding Invoice.",
    resultTone: "default",
    action: "Normal. Tunggu pembayaran atau follow up kalau sudah lewat jatuh tempo (baru jadi Overdue).",
  },
  {
    title: "Dibayar pas",
    example: "PT ABC transfer Rp10.000.000, diklasifikasi Payment, dialokasikan penuh ke invoice tadi.",
    result: "Invoice jadi Lunas.",
    resultTone: "default",
    action: "Tidak ada tindakan lagi — hilang dari Outstanding otomatis.",
  },
  {
    title: "Dibayar sebagian, invoice-nya boleh dicicil",
    example: "PT ABC baru transfer Rp6.000.000 dari Rp10.000.000, dan invoice memang di-setting “boleh partial payment”.",
    result: "Tetap Normal, tidak masuk Review Required.",
    resultTone: "default",
    action: "Tidak ada tindakan — sisa Rp4.000.000 akan otomatis mengurangi Outstanding invoice tersebut saat dibayar lagi.",
  },
  {
    title: "Dibayar sebagian, invoice-nya TIDAK boleh dicicil",
    example: "PT ABC baru transfer Rp6.000.000 dari Rp10.000.000, tapi invoice tidak di-setting boleh partial.",
    result: "Masuk Review Required — alasan: “Partial payment pada invoice yang tidak mengizinkan partial payment.”",
    resultTone: "danger",
    action: "Konfirmasi ke client apakah memang mau dicicil (lalu ubah setting invoice-nya kalau memang disetujui) atau tunggu pelunasan penuh.",
  },
  {
    title: "Dibayar lebih dari tagihan (Overpayment)",
    example: "Invoice Rp10.000.000, tapi yang dialokasikan ke invoice itu Rp12.000.000.",
    result: "Masuk Review Required — alasan: “Overpayment pada invoice INV-xxx.”",
    resultTone: "danger",
    action: "Cek dulu kenapa lebih: (1) mungkin kelebihannya untuk invoice lain — alokasikan sisanya ke invoice yang sesuai; (2) client memang kelebihan transfer — catat sebagai deposit/koordinasikan ke client, sistem tidak memutuskan ini otomatis; (3) salah pilih invoice saat alokasi — bisa dikoreksi (bukan dihapus, supaya jejaknya tetap ada).",
  },
  {
    title: "Uang masuk, belum jelas punya siapa",
    example: "Ada transfer masuk Rp5.000.000 tanpa keterangan jelas dari client mana.",
    result: "Muncul sebagai Unlinked Transaction.",
    resultTone: "warning",
    action: "Boleh dibiarkan dulu — ini valid, jangan menebak/klaim sepihak. Isi Client/Matter-nya begitu benar-benar sudah pasti.",
  },
  {
    title: "Client titip dana (Deposit)",
    example: "Client titip Rp5.000.000 untuk keperluan yang nominal finalnya belum pasti (misalnya PNBP).",
    result: "Transaksi diklasifikasi sebagai Deposit — masuk halaman Deposits sebagai saldo titipan, BUKAN sebagai Payment.",
    resultTone: "default",
    action: "Tidak perlu tindakan di Needs Attention — Deposit murni dipantau saldonya (Diterima / Terpakai / Sisa), tidak pernah kena Review Required. Baru dicatat “terpakai” kalau dananya memang sudah dipakai untuk keperluan yang dimaksud. Jangan klasifikasi Deposit hanya karena transaksinya berkaitan dengan PNBP/BPHTB — pakai Deposit hanya kalau memang secara bisnis itu titipan.",
  },
  {
    title: "Kantor keluarkan uang ke pihak ketiga (Disbursement)",
    example: "Kantor transfer Rp2.000.000 ke BPN untuk biaya balik nama, arah transaksinya OUT.",
    result: "Transaksi diklasifikasi sebagai Disbursement, boleh dipilih rekening bank asal dananya.",
    resultTone: "default",
    action: "Beda dari Payment — Disbursement tidak dialokasikan ke invoice, cukup dicatat sebagai pengeluaran. Bisa dipantau ringkasannya per rekening bank di halaman Disbursements.",
  },
];

// Closes a real gap found after this page shipped: the scenarios below
// only teach the general PATTERN ("overpayment usually means X/Y/Z"), not
// how to check what actually happened on one specific real record — this
// app's dedicated tool for that is Transaction Trace (already built, not
// new), specifically its Timeline section. Labels below are copied
// verbatim from TransactionTraceView.tsx's actual <h2> headings
// ("Timeline", "Relationships", "Audit") so the instructions never say
// something the screen doesn't.
const TRACE_STEPS = [
  { label: "Buka detail transaksinya", body: "Dari Needs Attention, Review, atau list manapun, klik transaksi/invoice yang dimaksud sampai masuk ke halaman detailnya." },
  { label: "Scroll ke bagian “Timeline”", body: "Ini riwayat kejadian ASLI untuk transaksi itu saja, bukan pola umum — urut dari dibuat sampai sekarang, lengkap tanggal+jam." },
  { label: "Baca tiap baris", body: "Tiap baris nunjukin kejadian apa (dibuat / di-link / diklasifikasi / dialokasikan / dikoreksi), kapan, dan kalau staf mengisi alasan saat itu, alasannya juga tampil." },
  { label: "Perhatikan baris “Aksi:” kalau ada", body: "Beberapa kejadian otomatis dapat saran tindakan dari sistem — misalnya kalau alasannya soal kelebihan alokasi, akan muncul saran langkah berikutnya." },
  { label: "Cek “Relationships” & “Audit” kalau perlu", body: "Relationships menampilkan Client/Matter/Invoice terkait di halaman yang sama (tidak perlu pindah-pindah). Audit adalah versi tabel mentah (User/Waktu/Aksi) untuk yang mau detail teknis." },
];

function StepTimeline() {
  return (
    <ol className="relative ml-3 border-l border-border pl-6">
      {STEPS.map((s) => (
        <li key={s.title} className="mb-6 last:mb-0">
          <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
          <h3 className="text-sm font-semibold text-text">{s.title}</h3>
          <p className="mt-1 text-sm text-muted">{s.body}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <a href={s.href} className="inline-block text-xs font-medium text-primary hover:underline">
              {s.cta} &rarr;
            </a>
            {s.secondaryHref && (
              <a href={s.secondaryHref} className="inline-block text-xs font-medium text-muted hover:text-primary hover:underline">
                {s.secondaryCta} &rarr;
              </a>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function AttentionAccordion() {
  return (
    <div className="divide-y divide-border">
      {ATTENTION.map((a) => (
        <details key={a.key} id={a.key} className="group px-5 py-4 open:bg-bg/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_DOT[a.tone]}`} />
              <span className="text-sm font-medium text-text">{a.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_BADGE[a.tone]}`}>
                {a.tone === "danger" ? "perlu dicek" : a.tone === "warning" ? "soft reminder" : "informasi"}
              </span>
            </div>
            <svg
              className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="mt-3 space-y-2 pl-5 text-sm">
            <p><span className="font-medium text-text">Apa itu: </span><span className="text-muted">{a.what}</span></p>
            <p><span className="font-medium text-text">Kenapa muncul: </span><span className="text-muted">{a.why}</span></p>
            <p><span className="font-medium text-text">Tindakan: </span><span className="text-muted">{a.action}</span></p>
            <a href={a.href} className="inline-block pt-1 text-xs font-medium text-primary hover:underline">
              {a.cta} &rarr;
            </a>
          </div>
        </details>
      ))}
    </div>
  );
}

function ScenarioAccordion() {
  return (
    <div className="divide-y divide-border">
      {SCENARIOS.map((s, i) => (
        <details key={s.title} className="group px-5 py-4 open:bg-bg/50" open={i === 4}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="text-sm font-medium text-text">{s.title}</span>
            <svg
              className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="mt-3 space-y-2 pl-1 text-sm">
            <p><span className="font-medium text-text">Contoh: </span><span className="text-muted">{s.example}</span></p>
            <p>
              <span className="font-medium text-text">Hasilnya: </span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${TONE_BADGE[s.resultTone]}`}>{s.result}</span>
            </p>
            <p><span className="font-medium text-text">Yang perlu dilakukan: </span><span className="text-muted">{s.action}</span></p>
          </div>
        </details>
      ))}
    </div>
  );
}

function TraceGuide() {
  return (
    <ol className="space-y-4">
      {TRACE_STEPS.map((t, i) => (
        <li key={t.label} className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {i + 1}
          </span>
          <div>
            <div className="text-sm font-medium text-text">{t.label}</div>
            <div className="mt-0.5 text-sm text-muted">{t.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

const QUICK_JUMP = [
  { href: "#alur", label: "Alur dari Awal" },
  { href: "#needs-attention", label: "Kotak di Dashboard" },
  { href: "#skenario", label: "Contoh Kasus" },
  { href: "#trace", label: "Cek Transaksi Tertentu" },
  { href: "#prinsip", label: "Prinsip Penting" },
];

// 30-second version for someone who just wants the gist, before the
// detailed (accordion) sections below — serves skimmers without forcing
// deep-readers to scroll past it either.
const TLDR = [
  "Alur intinya: Client → Matter → Rincian Biaya → Invoice → Uang masuk → Diklasifikasi → Dialokasikan → Lunas.",
  "Kotak di Dashboard itu otomatis dihitung sistem, bukan alarm manual — klik ikon “?” di sampingnya buat tau kenapa muncul.",
  "Review Required bukan error, cuma tanda “tolong dicek” — kerjaan lain tidak ikut terblokir.",
  "Nemu satu transaksi yang aneh? Buka detailnya, lihat bagian Timeline — itu nunjukin persis apa yang terjadi pada transaksi itu.",
];

// Mirrors src/app/(app)/page.tsx's NeedsAttention categories/tone/href
// exactly, reusing the same already-computed summary object (0 new
// calculation) — bridges the generic Rp10jt examples above to her actual
// current numbers, so this page isn't purely abstract.
function situasiItems(summary: Awaited<ReturnType<typeof getDashboardSummaryCards>>) {
  return [
    { key: "review", count: summary.reviewRequired, label: "Review Required", tone: "danger" as const, href: "/review" },
    { key: "unlinked", count: summary.unlinked, label: "Unlinked", tone: "warning" as const, href: "/transactions?linked=unlinked" },
    { key: "unallocated", count: summary.unallocatedPaymentCount, label: "Unallocated Payments", tone: "warning" as const, href: "/payments?allocationStatus=UNALLOCATED" },
    { key: "source", count: summary.sourcePending, label: "Source Pending", tone: "warning" as const, href: "/transactions?sourceType=SOURCE_PENDING" },
    { key: "overdue", count: summary.overdueCount, label: "Overdue Invoices", tone: "danger" as const, href: "/invoices?aging=overdue" },
  ].filter((i) => i.count > 0);
}

export default async function GuidePage() {
  const summary = await getDashboardSummaryCards();
  const situasi = situasiItems(summary);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Panduan Alur Kerja</h1>
        <p className="mt-1 text-sm text-muted">
          Dari input order baru sampai kenapa sesuatu bisa muncul di Needs Attention, dan cara menyelesaikannya.
          Tidak perlu dibaca urut dari atas &mdash; langsung lompat ke bagian yang relevan.
        </p>

        <ul className="mt-3 space-y-1 rounded-control border border-border bg-card px-4 py-3 text-sm text-muted">
          {TLDR.map((line) => (
            <li key={line}>&bull; {line}</li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-text">Situasi kamu sekarang:</span>
          {situasi.length === 0 ? (
            <span className="text-muted">Semua aman, tidak ada yang perlu ditindaklanjuti.</span>
          ) : (
            situasi.map((s) => (
              <a
                key={s.key}
                href={s.href}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  s.tone === "danger" ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning"
                }`}
              >
                {s.count} {s.label}
              </a>
            ))
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_JUMP.map((q) => (
            <a key={q.href} href={q.href} className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text hover:border-primary/40 hover:text-primary">
              {q.label}
            </a>
          ))}
        </div>
      </div>

      <Card id="alur">
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">1. Alur Kerja dari Awal</h2>
          <p className="mt-0.5 text-xs text-muted">Dari Client baru sampai invoice lunas.</p>
        </CardHeader>
        <CardBody>
          <StepTimeline />
        </CardBody>
      </Card>

      <Card id="needs-attention">
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">2. Kenapa Muncul di Needs Attention?</h2>
          <p className="mt-0.5 text-xs text-muted">
            Klik tiap baris untuk lihat penjelasan lengkap. Urutan sama seperti di Dashboard.
          </p>
        </CardHeader>
        <AttentionAccordion />
      </Card>

      <Card id="skenario">
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">3. Contoh Kasus, dari Order Baru sampai Selesai</h2>
          <p className="mt-0.5 text-xs text-muted">Enam skenario paling umum, dengan contoh angka dan cara menyelesaikannya.</p>
        </CardHeader>
        <ScenarioAccordion />
      </Card>

      <Card id="trace">
        <CardHeader>
          <h2 className="text-sm font-semibold text-text">4. Nemu Kasus Spesifik? Cek Transaction Trace</h2>
          <p className="mt-0.5 text-xs text-muted">
            Skenario di atas kasih pola umum. Untuk tau PERSIS apa yang terjadi pada satu transaksi tertentu
            (misalnya transaksi yang bacaannya tiba-tiba lebih dari tagihan), transaksi itu sendiri punya riwayat lengkap
            &mdash; ini caranya:
          </p>
        </CardHeader>
        <CardBody>
          <TraceGuide />
        </CardBody>
      </Card>

      <Card id="prinsip" className="border-primary/20 bg-blue-50/40">
        <CardBody>
          <h2 className="text-sm font-semibold text-text">5. Prinsip Penting, Supaya Tidak Perlu Panik</h2>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            <li>&bull; Sistem <span className="font-medium text-text">tidak pernah</span> memutuskan sendiri Client/Matter suatu transaksi &mdash; kalau belum jelas, biarkan Unlinked.</li>
            <li>&bull; <span className="font-medium text-text">Review Required bukan error.</span> Itu cuma tanda &ldquo;tolong dicek&rdquo;, bukan tanda ada yang rusak.</li>
            <li>&bull; Selama ada item di Needs Attention, kerjaan lain <span className="font-medium text-text">tidak ikut terblokir</span> &mdash; boleh dikerjakan kapan sempat.</li>
            <li>&bull; Data finansial <span className="font-medium text-text">tidak pernah dihapus</span> &mdash; kalau salah input, dibatalkan/dikoreksi, supaya jejaknya tetap kelihatan.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
