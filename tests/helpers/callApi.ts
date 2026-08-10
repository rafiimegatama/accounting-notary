// Calls a Next.js route handler function directly (bypassing the Next.js
// router) so scenario tests exercise the actual production code path —
// validation, audit logging, getCurrentUser header parsing — not a
// reimplementation of it.
type Handler = (req: Request, ctx?: { params: Record<string, string> }) => Promise<Response>;

export async function call(
  handler: Handler,
  opts: {
    method?: string;
    body?: unknown;
    formData?: FormData;
    headers?: Record<string, string>;
    params?: Record<string, string>;
    query?: Record<string, string>;
    staffName?: string | null;
  } = {}
) {
  const url = new URL("http://localhost/api/test");
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);

  const staffName = opts.staffName === undefined ? "Test Staff" : opts.staffName;
  const req = new Request(url, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.formData ? {} : { "content-type": "application/json" }),
      ...(staffName ? { "x-staff-name": staffName } : {}),
      ...opts.headers,
    },
    body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });

  const res = await handler(req, opts.params ? { params: opts.params } : undefined);
  const json = await res.json();
  return { status: res.status, json };
}
