"use client";

// Client-side fetch wrapper: unwraps the standard {success, data, message}
// / {success:false, errorCode, message} envelope from Step 13, throws a
// plain Error with the server's message on failure. Authentication is the
// browser's session cookie (sent automatically on same-origin requests) —
// no manual header needed since the auth rebuild (see src/lib/session.ts).
export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const isFormData = options.body instanceof FormData;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });

  const json = await res.json();
  if (!json.success) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error(json.message ?? "Terjadi kesalahan.");
  }
  return json.data as T;
}
