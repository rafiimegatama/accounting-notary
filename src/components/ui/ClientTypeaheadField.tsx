"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { Typeahead } from "@/components/ui/Typeahead";

interface ClientOption {
  id: string;
  name: string;
}

// Reusable Client filter field for native GET filter forms (Cost
// Details/Invoices/Payments list pages). Renders a hidden input carrying
// the selected client's id so a plain <form method="get"> picks it up on
// submit — no client-side routing/JS submission needed. Selecting is
// required to apply the filter; typed-but-unselected text is ignored on
// submit rather than guessed (CLAUDE.md constraint 3: no auto-claim).
export function ClientTypeaheadField({
  name = "clientId",
  defaultClientId,
  defaultClientName,
  label = "Client",
}: {
  name?: string;
  defaultClientId?: string;
  defaultClientName?: string;
  label?: string;
}) {
  const [query, setQuery] = useState(defaultClientName ?? "");
  const [results, setResults] = useState<ClientOption[]>([]);
  const [selectedId, setSelectedId] = useState(defaultClientId ?? "");

  useEffect(() => {
    if (selectedId || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setResults(await apiFetch<ClientOption[]>(`/api/clients?search=${encodeURIComponent(query)}`));
    }, 250);
    return () => clearTimeout(t);
  }, [query, selectedId]);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input type="hidden" name={name} value={selectedId} />
      <Typeahead
        value={query}
        onChange={(text) => {
          setQuery(text);
          setSelectedId("");
        }}
        options={results.map((c) => ({ value: c.id, label: c.name }))}
        onSelect={(opt) => {
          setSelectedId(opt.value);
          setQuery(opt.label);
        }}
        placeholder="Cari client..."
        emptyHint={query.trim().length < 2 ? "Ketik minimal 2 huruf" : "Tidak ditemukan"}
      />
    </div>
  );
}
