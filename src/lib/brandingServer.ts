import { prisma } from "./prisma";
import { BRANDING_KEYS, BRANDING_DEFAULTS, type BrandingSettings } from "./branding";

export async function getBrandingSettings(): Promise<BrandingSettings> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: BRANDING_KEYS } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const result = {} as BrandingSettings;
  for (const key of BRANDING_KEYS) {
    result[key] = byKey.get(key) ?? BRANDING_DEFAULTS[key];
  }
  return result;
}
