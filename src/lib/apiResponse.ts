import { NextResponse } from "next/server";

// Standard response envelope — mandated by master prompt Step 13.
export function apiSuccess<T>(data: T, message = "OK", status = 200) {
  return NextResponse.json(
    { success: true, data, message, timestamp: new Date().toISOString() },
    { status }
  );
}

export class ApiError extends Error {
  constructor(public errorCode: string, message: string, public status = 400) {
    super(message);
  }
}

export function apiError(errorCode: string, message: string, status = 400) {
  return NextResponse.json(
    { success: false, errorCode, message, timestamp: new Date().toISOString() },
    { status }
  );
}

// Wraps a route handler so any thrown ApiError (or unexpected error)
// becomes a well-formed error envelope instead of an unhandled 500 blob.
export function withApiHandler<T>(handler: () => Promise<NextResponse>) {
  return handler().catch((err) => {
    if (err instanceof ApiError) {
      return apiError(err.errorCode, err.message, err.status);
    }
    console.error(err);
    return apiError("INTERNAL_ERROR", "Terjadi kesalahan pada server.", 500);
  });
}
