import { prisma } from "@/lib/db";
import { createSecureToken, persistQrToken } from "@/lib/crypto-token";
import { newUpdateTag } from "@/lib/wallet/ticket-payload";

/**
 * Revoke the active QR and issue a new one so forwarded PDFs cannot be reused
 * alongside the recipient's ticket.
 */
export async function rotateTicketQrToken(ticketId: string): Promise<string> {
  const plain = createSecureToken(32);
  const stored = persistQrToken(plain);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.ticketQrToken.updateMany({
      where: { ticketId, status: "active" },
      data: { status: "revoked", revokedAt: now },
    });
    await tx.ticketQrToken.create({
      data: {
        ticketId,
        tokenHash: stored.tokenHash,
        token: stored.token,
        status: "active",
      },
    });
  });

  await prisma.ticketWalletPass.updateMany({
    where: { ticketId, status: "active" },
    data: { updateTag: newUpdateTag() },
  });

  return plain;
}
