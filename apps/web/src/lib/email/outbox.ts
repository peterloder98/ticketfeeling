import nodemailer from "nodemailer";
import { writeAudit } from "@/lib/audit";
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

export async function enqueueTransactionalEmail(input: {
  organizationId: string;
  to: string | string[];
  template: string;
  subject: string;
  payload: Record<string, unknown>;
  /** Attach ticket PDFs when ticketIds provided */
  ticketIds?: string[];
  /** Prefer one combined PDF for the whole order */
  orderIdForCombinedPdf?: string;
  /** Already-rendered PDF buffers (skips re-render) */
  pdfAttachments?: { filename: string; content: Buffer }[];
  /** Optional body overrides (fixed templates) */
  text?: string;
  html?: string;
  /** Smaller PDF for email attachments */
  compactPdf?: boolean;
  /** Embed brand logo as CID (default true for ticket mails) */
  embedLogo?: boolean;
}): Promise<MailSendResult> {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to])
    .map((t) => t.trim())
    .filter(Boolean);
  const toHeader = recipients.join(", ");
  const primaryTo = recipients[0] ?? "";

  if (!primaryTo || recipients.every((t) => t.includes("@ticketfeeling.local"))) {
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

  const attachments: Attachment[] = [];
  const compact = input.compactPdf ?? Boolean(input.ticketIds?.length || input.orderIdForCombinedPdf);
  const embedLogo = input.embedLogo !== false;

  if (input.pdfAttachments?.length) {
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

  // Prefer one combined order PDF; fall back to per-ticket PDFs so the mail always
  // gets real attachments when any ticket can be rendered.
  if (!attachments.some((a) => a.contentType === "application/pdf") && input.orderIdForCombinedPdf) {
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

  if (!attachments.some((a) => a.contentType === "application/pdf") && input.ticketIds?.length) {
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
    },
  });

  return {
    queued: true,
    provider: "smtp",
    messageId: info.messageId,
    attachments: pdfCount,
  };
}

/** Optional HTML body helper for richer tickets mail later */
export async function previewTicketHtml(ticketId: string) {
  return renderTicketHtml(ticketId);
}
