import nodemailer from "nodemailer";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { renderTicketHtml } from "@/lib/commerce/ticket-document";
import { renderOrderTicketsPdf, renderTicketPdf } from "@/lib/commerce/ticket-pdf";
import { normalizeSmtpTransport, resolveOutboundSmtp } from "@/lib/email/accounts";
import { EMAIL_LOGO_CID, loadEmailLogoBuffer } from "@/lib/email/ticket-mail";

export type MailSendResult =
  | { queued: true; provider: "smtp"; messageId?: string; attachments: number }
  | { queued: true; provider: "stub"; reason: string; attachments: number };

function buildBody(template: string, payload: Record<string, unknown>) {
  const lines = [
    `Vorlage: ${template}`,
    "",
    ...Object.entries(payload).map(([k, v]) => `${k}: ${String(v ?? "")}`),
    "",
    "—",
    "Ticketfeeling",
  ];
  return lines.join("\n");
}

type Attachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid?: string;
  contentDisposition?: "inline" | "attachment";
};

/** Buyer ticket mails — never attach ticket PDFs (links only). */
const NEVER_ATTACH_TICKET_PDF_TEMPLATES = new Set([
  "order_paid_tickets",
  "sepa_payment_succeeded",
  "tickets_resent",
  "event_schedule_changed",
]);

export async function enqueueTransactionalEmail(input: {
  organizationId: string;
  to: string | string[];
  template: string;
  subject: string;
  payload: Record<string, unknown>;
  /**
   * Explicit opt-in required to attach ticket PDFs (from ticketIds,
   * orderIdForCombinedPdf, or pdfAttachments).
   * Buyer confirmation templates ignore this and never attach ticket PDFs.
   */
  attachTicketPdfs?: boolean;
  /** Ticket ids to render as PDF attachments (requires attachTicketPdfs) */
  ticketIds?: string[];
  /** Prefer one combined PDF for the whole order (requires attachTicketPdfs) */
  orderIdForCombinedPdf?: string;
  /** Already-rendered PDF buffers (requires attachTicketPdfs; ticket numbers ≠ "ticket" in name) */
  pdfAttachments?: { filename: string; content: Buffer }[];
  /** Optional body overrides (fixed templates) */
  text?: string;
  html?: string;
  /** Smaller PDF for email attachments */
  compactPdf?: boolean;
  /** Embed brand logo as CID (default true for ticket mails) */
  embedLogo?: boolean;
  /** Optional order link for EmailDelivery tracking */
  orderId?: string;
  /** Persist EmailDelivery row (QUEUED→SENT/FAILED) */
  trackDelivery?: boolean;
}): Promise<MailSendResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((t) => t.trim())
    .filter(Boolean);
  const toHeader = recipients.join(", ");
  const primaryTo = recipients[0] ?? "";

  let deliveryId: string | null = null;
  const track = input.trackDelivery === true && Boolean(primaryTo);

  async function markDelivery(
    status: string,
    extra?: { provider?: string; messageId?: string; error?: string },
  ) {
    if (!track || !deliveryId) return;
    try {
      await prisma.emailDelivery.update({
        where: { id: deliveryId },
        data: {
          status,
          provider: extra?.provider,
          providerMessageId: extra?.messageId,
          lastError: extra?.error ?? null,
          sentAt: status === "SENT" ? new Date() : undefined,
          attemptCount: { increment: 1 },
        },
      });
    } catch (error) {
      console.error("[email] delivery status update failed", deliveryId, error);
    }
  }

  const { isSyntheticBuyerEmail } = await import("@/lib/commerce/customers");
  if (!primaryTo || recipients.every((t) => isSyntheticBuyerEmail(t))) {
    await writeAudit({
      organizationId: input.organizationId,
      action: "email.skipped_local_guest",
      entityType: "email",
      entityId: input.template,
      after: { to: toHeader || primaryTo },
    });
    return {
      queued: true,
      provider: "stub",
      reason: "local_guest",
      attachments: 0,
    };
  }

  if (track) {
    try {
      const row = await prisma.emailDelivery.create({
        data: {
          organizationId: input.organizationId,
          toEmail: primaryTo.toLowerCase(),
          template: input.template,
          subject: input.subject,
          status: "QUEUED",
          orderId: input.orderId ?? null,
          payload: input.payload as object,
        },
        select: { id: true },
      });
      deliveryId = row.id;
    } catch (error) {
      console.error("[email] delivery row create failed", error);
    }
  }

  const attachments: Attachment[] = [];
  const neverTicketPdfs = NEVER_ATTACH_TICKET_PDF_TEMPLATES.has(input.template);
  // Hard rule: buyer confirmations never get ticket PDFs, even if a caller
  // accidentally passes attachTicketPdfs / ticketIds / pdfAttachments.
  const allowTicketPdfs = !neverTicketPdfs && input.attachTicketPdfs === true;
  const compact =
    input.compactPdf ??
    Boolean(allowTicketPdfs && (input.ticketIds?.length || input.orderIdForCombinedPdf));
  const embedLogo = input.embedLogo !== false;

  if (input.pdfAttachments?.length) {
    if (!allowTicketPdfs) {
      console.warn(
        "[email] skipped pdfAttachments (attachTicketPdfs required / template blocked)",
        input.template,
        input.pdfAttachments.length,
      );
    } else {
      for (const pdf of input.pdfAttachments) {
        if (pdf.content.length > 0) {
          attachments.push({
            filename: pdf.filename,
            content: pdf.content,
            contentType: "application/pdf",
          });
        }
      }
    }
  }

  // Prefer one combined order PDF; fall back to per-ticket PDFs — only when
  // callers explicitly opt in (box office / forward / resend).
  if (
    allowTicketPdfs &&
    !attachments.some((a) => a.contentType === "application/pdf") &&
    input.orderIdForCombinedPdf
  ) {
    try {
      const pdf = await renderOrderTicketsPdf(input.orderIdForCombinedPdf);
      if (pdf.buffer.length > 0) {
        attachments.push({
          filename: pdf.filename,
          content: pdf.buffer,
          contentType: "application/pdf",
        });
      }
    } catch (error) {
      console.error("[email] order pdf attach failed", input.orderIdForCombinedPdf, error);
    }
  }

  if (
    allowTicketPdfs &&
    !attachments.some((a) => a.contentType === "application/pdf") &&
    input.ticketIds?.length
  ) {
    for (const ticketId of input.ticketIds) {
      try {
        const pdf = await renderTicketPdf(ticketId, { compact });
        if (pdf.buffer.length > 0) {
          attachments.push({
            filename: pdf.filename,
            content: pdf.buffer,
            contentType: "application/pdf",
          });
        }
      } catch (error) {
        console.error("[email] pdf attach failed", ticketId, error);
      }
    }
  }

  if (
    neverTicketPdfs &&
    (input.attachTicketPdfs ||
      input.ticketIds?.length ||
      input.orderIdForCombinedPdf ||
      input.pdfAttachments?.length)
  ) {
    console.warn(
      "[email] buyer confirmation refuses ticket PDF attachments",
      input.template,
      {
        attachTicketPdfs: input.attachTicketPdfs === true,
        ticketIds: input.ticketIds?.length ?? 0,
        orderIdForCombinedPdf: Boolean(input.orderIdForCombinedPdf),
        pdfAttachments: input.pdfAttachments?.length ?? 0,
      },
    );
  }

  if (embedLogo) {
    const logo = loadEmailLogoBuffer();
    if (logo) {
      attachments.push({
        filename: "ticketfeeling-logo.png",
        content: logo,
        contentType: "image/png",
        cid: EMAIL_LOGO_CID,
        contentDisposition: "inline",
      });
    }
  }

  const pdfCount = attachments.filter((a) => a.contentType === "application/pdf").length;

  const smtp = await resolveOutboundSmtp(input.organizationId);
  if (!smtp) {
    await markDelivery("FAILED", { provider: "stub", error: "smtp_not_configured" });
    await writeAudit({
      organizationId: input.organizationId,
      action: "email.queued_stub",
      entityType: "email",
      entityId: input.template,
      after: {
        to: toHeader.toLowerCase(),
        template: input.template,
        subject: input.subject,
        reason: "smtp_not_configured",
        pdfAttachments: pdfCount,
        deliveryId,
      },
    });
    if (process.env.NODE_ENV === "development") {
      console.info(
        "[email-stub/smtp-missing]",
        input.template,
        toHeader,
        input.subject,
        `pdfs=${pdfCount}`,
      );
    }
    return {
      queued: true,
      provider: "stub",
      reason: "smtp_not_configured",
      attachments: pdfCount,
    };
  }

  const textBody = input.text ?? buildBody(input.template, input.payload);
  const htmlBody =
    input.html ??
    `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${textBody
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")}</pre>`;

  const transport = normalizeSmtpTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
  });
  const transporter = nodemailer.createTransport({
    host: transport.host,
    port: transport.port,
    secure: transport.secure,
    requireTLS: transport.requireTLS,
    auth: { user: smtp.user, pass: smtp.password.trim() },
    tls: { minVersion: "TLSv1.2" },
  });

  try {
    await markDelivery("SENDING", { provider: "smtp" });
    const info = await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: toHeader,
      subject: input.subject,
      text: textBody,
      html: htmlBody,
      attachments: attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
        cid: a.cid,
        contentDisposition: a.contentDisposition,
      })),
    });

    await markDelivery("SENT", { provider: "smtp", messageId: info.messageId });
    await writeAudit({
      organizationId: input.organizationId,
      action: "email.sent",
      entityType: "email",
      entityId: input.template,
      after: {
        to: toHeader.toLowerCase(),
        template: input.template,
        subject: input.subject,
        messageId: info.messageId,
        attachments: attachments.length,
        pdfAttachments: pdfCount,
        accountId: smtp.accountId,
        accountLabel: smtp.label,
        deliveryId,
      },
    });

    return {
      queued: true,
      provider: "smtp",
      messageId: info.messageId,
      attachments: pdfCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDelivery("FAILED", { provider: "smtp", error: message });
    throw error;
  }
}

/** Optional HTML body helper for richer tickets mail later */
export async function previewTicketHtml(ticketId: string) {
  return renderTicketHtml(ticketId);
}
