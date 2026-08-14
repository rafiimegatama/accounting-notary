import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withApiHandler } from "@/lib/apiResponse";
import { BRANDING_IMAGE_KEY, isBrandingImageSlot } from "@/lib/branding";

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), "attachments");
const BRANDING_DIR = path.join(ATTACHMENTS_DIR, "branding");
const CONTENT_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

// Public (no getCurrentUser) — the Login screen needs its background image
// before a session exists, same reasoning as GET /api/settings/branding.
// This is the app's first unauthenticated file-serving route; the surface
// is kept minimal on purpose: only 2 fixed slot names (never arbitrary
// filenames from the request), the value read back is always a filename
// this same app generated during upload, and it's rejected outright if it
// ever contains a path separator.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { slot: string } }) {
  return withApiHandler(async () => {
    if (!isBrandingImageSlot(params.slot)) throw new ApiError("NOT_FOUND", "Slot tidak dikenal.", 404);

    const setting = await prisma.systemSetting.findUnique({ where: { key: BRANDING_IMAGE_KEY[params.slot] } });
    if (!setting?.value || /[\\/]|\.\./.test(setting.value)) {
      throw new ApiError("NOT_FOUND", "Belum ada gambar untuk slot ini.", 404);
    }

    const ext = setting.value.split(".").pop() ?? "";
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    let buffer: Buffer;
    try {
      buffer = await readFile(path.join(BRANDING_DIR, setting.value));
    } catch {
      throw new ApiError("NOT_FOUND", "Gambar tidak ditemukan di server.", 404);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  });
}
