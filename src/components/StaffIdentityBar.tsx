"use client";

import { useEffect, useState } from "react";
import { getStaffName, setStaffName } from "@/lib/staffIdentity";

// Sits in the root layout — every screen that mutates data depends on this
// being filled in first (see Step 13: getCurrentUser reads x-staff-name).
export function StaffIdentityBar() {
  const [name, setName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setName(getStaffName());
  }, []);

  if (name && !editing) {
    return (
      <div style={{ fontSize: 12, padding: "4px 12px", background: "#f5f5f5", display: "flex", gap: 8, alignItems: "center" }}>
        <span>Staf: <strong>{name}</strong></span>
        <button onClick={() => { setDraft(name); setEditing(true); }} style={{ fontSize: 12 }}>Ganti</button>
      </div>
    );
  }

  return (
    <div style={{ fontSize: 12, padding: "4px 12px", background: "#fde68a", display: "flex", gap: 8, alignItems: "center" }}>
      <span>Masukkan nama staf (untuk audit trail):</span>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} style={{ fontSize: 12 }} />
      <button
        onClick={() => {
          if (!draft.trim()) return;
          setStaffName(draft);
          setName(draft.trim());
          setEditing(false);
        }}
        style={{ fontSize: 12 }}
      >
        Simpan
      </button>
    </div>
  );
}
