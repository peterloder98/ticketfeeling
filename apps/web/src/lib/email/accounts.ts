import nodemailer from "nodemailer";
import { getPrisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto-fields";

export type ResolvedSmtp = {
  accountId: string | null;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  label: string;
};

/** Migrate legacy OrganizationSettings.smtp* into EmailAccount once. */
export async function ensureEmailAccountsMigrated(organizationId: string) {
  const existing = await getPrisma().organizationEmailAccount.count({
    where: { organizationId },
  });
  if (existing > 0) return;

  const settings = await getPrisma().organizationSettings.findUnique({
    where: { organizationId },
  });
  if (!settings?.smtpHost?.trim() || !settings.smtpUser?.trim() || !settings.smtpPasswordEnc) {
    return;
  }

  await getPrisma().organizationEmailAccount.create({
    data: {
      organizationId,
      label: "Standard (migriert)",
      host: settings.smtpHost.trim(),
      port: settings.smtpPort || 465,
      secure: settings.smtpSecure ?? true,
      username: settings.smtpUser.trim(),
      passwordEnc: settings.smtpPasswordEnc,
      fromEmail: (settings.smtpFromEmail ?? settings.smtpUser).trim(),
      fromName: settings.smtpFromName?.trim() || "Ticketfeeling",
      isDefault: true,
    },
  });
}

export async function resolveOutboundSmtp(
  organizationId: string,
): Promise<ResolvedSmtp | null> {
  await ensureEmailAccountsMigrated(organizationId);

  const account = await getPrisma().organizationEmailAccount.findFirst({
    where: { organizationId, isDefault: true },
  });
  const fallback =
    account ??
    (await getPrisma().organizationEmailAccount.findFirst({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    }));

  if (fallback) {
    try {
      const password = decryptSecret(fallback.passwordEnc);
      return {
        accountId: fallback.id,
        host: fallback.host,
        port: fallback.port,
        secure: fallback.secure,
        user: fallback.username,
        password,
        fromEmail: fallback.fromEmail,
        fromName: fallback.fromName?.trim() || "Ticketfeeling",
        label: fallback.label,
      };
    } catch {
      return null;
    }
  }

  // Legacy fallback
  const settings = await getPrisma().organizationSettings.findUnique({
    where: { organizationId },
  });
  const host = settings?.smtpHost?.trim();
  const user = settings?.smtpUser?.trim();
  const fromEmail = settings?.smtpFromEmail?.trim() || user;
  if (!host || !user || !fromEmail || !settings?.smtpPasswordEnc) return null;
  try {
    return {
      accountId: null,
      host,
      port: settings.smtpPort || 465,
      secure: settings.smtpSecure ?? true,
      user,
      password: decryptSecret(settings.smtpPasswordEnc),
      fromEmail,
      fromName: settings.smtpFromName?.trim() || "Ticketfeeling",
      label: "Legacy SMTP",
    };
  } catch {
    return null;
  }
}

/** Normalize common SMTP port/TLS combos (Hostinger etc.). */
export function normalizeSmtpTransport(input: {
  host: string;
  port: number;
  secure: boolean;
}) {
  const host = input.host.trim();
  const port = input.port || 465;
  let secure = input.secure;
  // Implicit SSL on 465; STARTTLS on 587
  if (port === 465) secure = true;
  if (port === 587) secure = false;
  return { host, port, secure, requireTLS: port === 587 };
}

function formatSmtpError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unbekannter Fehler";
  const lower = raw.toLowerCase();
  if (
    lower.includes("535") ||
    lower.includes("authentication failed") ||
    lower.includes("invalid login")
  ) {
    return (
      "Der Test ist fehlgeschlagen: Anmeldung abgelehnt. " +
      "Bitte Benutzer (volle E-Mail), Passwort und Port prüfen (465 mit SSL oder 587)."
    );
  }
  if (lower.includes("econnrefused") || lower.includes("enotfound") || lower.includes("connect")) {
    return `Der Test ist fehlgeschlagen: Keine Verbindung zum Server. (${raw})`;
  }
  if (lower.includes("certificate") || lower.includes("ssl") || lower.includes("tls")) {
    return `Der Test ist fehlgeschlagen: TLS/SSL-Problem. (${raw})`;
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return `Der Test ist fehlgeschlagen: Zeitüberschreitung. (${raw})`;
  }
  return `Der Test ist fehlgeschlagen: ${raw}`;
}

export async function testSmtpConnection(input: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName?: string;
  /** If set, send a real test message to this address */
  sendTo?: string | null;
}): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  try {
    const transport = normalizeSmtpTransport(input);
    const user = input.user.trim();
    // Paste often adds BOM / trailing spaces — that breaks SMTP auth
    const password = input.password.replace(/^\uFEFF/, "").trim();

    const transporter = nodemailer.createTransport({
      host: transport.host,
      port: transport.port,
      secure: transport.secure,
      requireTLS: transport.requireTLS,
      auth: { user, pass: password },
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
      tls: { minVersion: "TLSv1.2" },
    });

    await transporter.verify();

    const to = input.sendTo?.trim();
    if (to) {
      await transporter.sendMail({
        from: `"${input.fromName?.trim() || "Ticketfeeling"}" <${input.fromEmail.trim()}>`,
        to,
        subject: "Ticketfeeling SMTP-Test",
        text: [
          "Dies ist eine Test-E-Mail von Ticketfeeling.",
          "",
          `Host: ${transport.host}:${transport.port}`,
          `From: ${input.fromEmail.trim()}`,
          "",
          "Wenn du diese Mail siehst, funktioniert der Versand.",
        ].join("\n"),
      });
      return {
        ok: true,
        message:
          "Der Test war erfolgreich, die Zugänge sind korrekt eingerichtet. Eine Testmail wurde gesendet.",
      };
    }

    return {
      ok: true,
      message: "Der Test war erfolgreich, die Zugänge sind korrekt eingerichtet.",
    };
  } catch (error) {
    return { ok: false, message: formatSmtpError(error) };
  }
}

export async function testEmailAccount(input: {
  organizationId: string;
  accountId: string;
  sendTo?: string | null;
}) {
  const account = await getPrisma().organizationEmailAccount.findFirst({
    where: { id: input.accountId, organizationId: input.organizationId },
  });
  if (!account) throw new Error("ACCOUNT_NOT_FOUND");

  let password: string;
  try {
    password = decryptSecret(account.passwordEnc);
  } catch {
    const fail = {
      ok: false as const,
      message:
        "Der Test ist fehlgeschlagen: Passwort konnte nicht entschlüsselt werden — bitte neu eingeben.",
    };
    await getPrisma().organizationEmailAccount.update({
      where: { id: account.id },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: false,
        lastTestMessage: fail.message,
      },
    });
    return fail;
  }

  const result = await testSmtpConnection({
    host: account.host,
    port: account.port,
    secure: account.secure,
    user: account.username,
    password,
    fromEmail: account.fromEmail,
    fromName: account.fromName ?? undefined,
    sendTo: input.sendTo,
  });

  await getPrisma().organizationEmailAccount.update({
    where: { id: account.id },
    data: {
      lastTestedAt: new Date(),
      lastTestOk: result.ok,
      lastTestMessage: result.message,
    },
  });

  return result;
}

export function encryptSmtpPassword(plain: string) {
  return encryptSecret(plain);
}
