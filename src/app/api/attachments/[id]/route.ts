import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, withApiHandler } from "@/lib/apiResponse";
import { getCurrentUser } from "@/lib/currentUser";

// P2 evidence visibility: every attachment listing across the app
// (Position view, Invoice/Payment detail, Transaction Trace) has always
// shown only a filename as inert text — files are stored on the server's
// local filesystem (Step 10) but there was never a route to actually read
// one back. This is the minimal glue for that, not a document management
// system: no preview, no versioning, no listing — just "download the file
// this attachment record points to," same auth as every other route.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  return withApiHandler(async () => {
    getCurrentUser(request);
    const attachment = await prisma.financialAttachment.findUnique({ where: { id: params.id } });
    if (!attachment) throw new ApiError("NOT_FOUND", "Attachment tidak ditemukan.", 404);

    let buffer: Buffer;
    try {
      buffer = await readFile(attachment.filePath);
    } catch {
      throw new ApiError("NOT_FOUND", "File attachment tidak ditemukan di server.", 404);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": attachment.fileType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      },
    });
  });
}
