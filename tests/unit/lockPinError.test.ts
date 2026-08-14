import { describe, it, expect } from "vitest";
import { resolveVerifyPinError } from "@/lib/lockPinError";

describe("resolveVerifyPinError", () => {
  it("a null response (unparseable / network failure) is a generic error — never unlocks", () => {
    expect(resolveVerifyPinError(null)).toBe("Terjadi kesalahan saat memverifikasi PIN. Silakan coba lagi.");
  });

  it("success:true resolves to null — the only case that should unlock", () => {
    expect(resolveVerifyPinError({ success: true })).toBeNull();
  });

  it("INVALID_CREDENTIALS (wrong PIN) is remapped to the Lock Screen's own exact copy, not the server's shorter string", () => {
    const result = resolveVerifyPinError({
      success: false,
      errorCode: "INVALID_CREDENTIALS",
      message: "PIN salah.",
    });
    expect(result).toBe("PIN tidak sesuai. Silakan coba lagi.");
  });

  it("a real, distinct server error (e.g. expired session) keeps its own message rather than being genericized", () => {
    const result = resolveVerifyPinError({
      success: false,
      errorCode: "UNAUTHENTICATED",
      message: "Sesi berakhir. Silakan login kembali.",
    });
    expect(result).toBe("Sesi berakhir. Silakan login kembali.");
  });

  it("a failure with no message at all falls back to the generic error", () => {
    const result = resolveVerifyPinError({ success: false, errorCode: "INTERNAL_ERROR" });
    expect(result).toBe("Terjadi kesalahan saat memverifikasi PIN. Silakan coba lagi.");
  });
});
