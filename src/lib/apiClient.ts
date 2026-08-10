"use client";

import { getStaffName } from "./staffIdentity";

// Client-side fetch wrapper: attaches x-staff-name, unwraps the standard
// {success, data, message} / {success:false, errorCode, message} envelope
// from Step 13, throws a plain Error with the server's message on failure.
export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const staffName = getStaffName();
  const isFormData = options.body instanceof FormData;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(staffName ? { "x-staff-name": staffName } : {}),
      ...options.headers,
    },
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message ?? "Terjadi kesalahan.");
  }
  return json.data as T;
}
