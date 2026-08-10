import { prisma } from "@/lib/prisma";
import { apiSuccess, withApiHandler } from "@/lib/apiResponse";

// GET /api/auth/staff — list of ACTIVE staff for the login picker. Never
// returns pinHash/pinSalt.
//
// force-dynamic: this handler takes no params and touches no dynamic API
// (no request.url/headers/cookies), so Next.js would otherwise treat it as
// static and cache the response at BUILD time — meaning it would freeze
// whatever the staff list looked like during `next build`, not the live
// table. Found during QA: a fresh build (empty staff table) kept returning
// an empty list even after seeding staff into the running database.
export const dynamic = "force-dynamic";

export async function GET() {
  return withApiHandler(async () => {
    const staff = await prisma.staff.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return apiSuccess(staff);
  });
}
