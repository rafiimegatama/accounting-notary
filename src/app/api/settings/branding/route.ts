import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler, ApiError } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";
import { BRANDING_TEXT_KEYS, isAccentPreset, type BrandingKey } from "@/lib/branding";
import { getBrandingSettings } from "@/lib/brandingServer";

// GET is intentionally public (no getCurrentUser) — the login screen
// itself needs branding before a session exists, same pattern as
// /api/auth/staff. Only cosmetic text/accent-name values are exposed,
// nothing sensitive.
export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const settings = await getBrandingSettings();
    return apiSuccess(settings);
  });
}

// POST requires a session — only an authenticated staff member can change
// branding. Only the fixed BRANDING_TEXT_KEYS are writable here (image
// slots are deliberately excluded — those are only ever set by the upload
// endpoint at /api/settings/branding/image, never by a free-text value) and
// branding_accent must be one of the closed preset names.
export async function POST(request: Request) {
  return withApiHandler(async () => {
    const userId = getCurrentUser(request);
    const body = await request.json();
    const updates: Record<string, string> = body.updates ?? {};

    for (const key of Object.keys(updates)) {
      if (!BRANDING_TEXT_KEYS.includes(key as BrandingKey)) {
        throw new ApiError("VALIDATION_ERROR", `Key branding tidak dikenal atau tidak bisa diubah lewat endpoint ini: ${key}`);
      }
    }
    if (updates.branding_accent && !isAccentPreset(updates.branding_accent)) {
      throw new ApiError("VALIDATION_ERROR", "Accent color harus salah satu preset yang tersedia.");
    }

    await prisma.$transaction(
      Object.entries(updates).map(([key, value]) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedBy: userId },
          update: { value, updatedBy: userId },
        })
      )
    );

    return apiSuccess(null, "Branding berhasil disimpan.");
  });
}
