import { COOKIE_NAME, createSessionCookieValue } from "@/lib/session";

// Calls a Next.js route handler function directly (bypassing the Next.js
// router) so scenario tests exercise the actual production code path —
// validation, audit logging, real session verification — not a
// reimplementation of it. Auth is a real signed session cookie built with
// the same signing function the app uses, not a bypass header.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: Request, ctx: any) => Promise<Response>;

const TEST_STAFF_ID = "00000000-0000-0000-0000-000000000001";

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
    unauthenticated?: boolean;
  } = {}
) {
  const url = new URL("http://localhost/api/test");
  if (opts.query) for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);

  const staffName = opts.staffName === undefined ? "Test Staff" : opts.staffName;
  const cookie =
    !opts.unauthenticated && staffName ? `${COOKIE_NAME}=${createSessionCookieValue(TEST_STAFF_ID, staffName)}` : undefined;

  const req = new Request(url, {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.formData ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...opts.headers,
    },
    body: opts.formData ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });

  const res = await handler(req, opts.params ? { params: opts.params } : undefined);
  const json = await res.json();
  return { status: res.status, json };
}
