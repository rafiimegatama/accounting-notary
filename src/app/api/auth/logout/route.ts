import { apiSuccess, withApiHandler } from "@/lib/apiResponse";
import { COOKIE_NAME } from "@/lib/session";

export async function POST() {
  return withApiHandler(async () => {
    const res = apiSuccess(null, "Logout berhasil.");
    res.cookies.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return res;
  });
}
