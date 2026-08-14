import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { BRANDING_IMAGE_KEY, isBrandingImageSlot } from "@/lib/branding";

// Separate subfolder from the financial-attachment ATTACHMENTS_DIR root —
// these are decorative UI assets, not evidence tied to a
// Client/Matter/Transaction/CostDetail/Invoice, so they deliberately don't
// go through the FinancialAttachment model at all.
const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR ?? path.join(process.cwd(), "attachments");
const BRANDING_DIR = path.join(ATTACHMENTS_DIR, "branding");

const MAX_BYTES = 3 * 1024 * 1024; // 3MB

// Checked by file signature (magic bytes), not the client-supplied
// Content-Type — a renamed non-image file would otherwise sail through a
// naive extension/MIME check.
function detectImageType(buffer: Buffer): { ext: string } | null {
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return { ext: "png" };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: "jpg" };
  if (buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP") return { ext: "webp" };
  return null;
}

// POST /api/settings/branding/image — multipart/form-data: slot ("hero" |
// "login") + file. Requires a session (unlike the GET serve route below,
// which must stay public for the pre-login screen).
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const form = await request.formData();
    const slot = form.get("slot");
    const file = form.get("file");

    if (typeof slot !== "string" || !isBrandingImageSlot(slot)) {
      throw new ApiError("VALIDATION_ERROR", "slot harus 'hero' atau 'login'.");
    }
    if (!(file instanceof File)) throw new ApiError("VALIDATION_ERROR", "field 'file' wajib berupa file.");
    if (file.size > MAX_BYTES) throw new ApiError("VALIDATION_ERROR", "Ukuran file maksimal 3MB.");

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectImageType(buffer);
    if (!detected) throw new ApiError("VALIDATION_ERROR", "File harus berupa gambar PNG, JPEG, atau WebP.");

    await mkdir(BRANDING_DIR, { recursive: true });
    const key = BRANDING_IMAGE_KEY[slot];

    // Replace, don't accumulate — one image per slot, old file removed so
    // re-uploads don't silently fill up the attachments volume over time.
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    if (existing?.value) {
      await unlink(path.join(BRANDING_DIR, existing.value)).catch(() => {});
    }

    const fileName = `${slot}-${Date.now()}.${detected.ext}`;
    await writeFile(path.join(BRANDING_DIR, fileName), buffer);

    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: fileName, updatedBy: userId },
      update: { value: fileName, updatedBy: userId },
    });

    return apiSuccess({ slot }, "Gambar berhasil diunggah.");
  });
}

// DELETE /api/settings/branding/image?slot=hero — reverts that slot back
// to the CSS-only treatment (empty value = no image, per BRANDING_IMAGE_DEFAULTS).
export async function DELETE(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const { searchParams } = new URL(request.url);
    const slot = searchParams.get("slot");

    if (!slot || !isBrandingImageSlot(slot)) throw new ApiError("VALIDATION_ERROR", "slot harus 'hero' atau 'login'.");

    const key = BRANDING_IMAGE_KEY[slot];
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    if (existing?.value) {
      await unlink(path.join(BRANDING_DIR, existing.value)).catch(() => {});
      await prisma.systemSetting.upsert({
        where: { key },
        create: { key, value: "", updatedBy: userId },
        update: { value: "", updatedBy: userId },
      });
    }

    return apiSuccess(null, "Gambar berhasil dihapus.");
  });
}
