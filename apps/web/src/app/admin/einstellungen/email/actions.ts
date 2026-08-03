"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";
import {
  encryptSmtpPassword,
  ensureEmailAccountsMigrated,
  testEmailAccount,
} from "@/lib/email/accounts";

async function requireOrgWrite() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const membership = await getDefaultOrganizationForUser(session.user.id);
  if (!membership) redirect("/login");
  const allowed = await userHasPermission(
    session.user.id,
    membership.organizationId,
    "org:write",
  );
  if (!allowed) throw new Error("FORBIDDEN");
  return { session, membership };
}

function parseAccountForm(formData: FormData) {
  const label = String(formData.get("label") ?? "").trim() || "E-Mail-Konto";
  const host = String(formData.get("host") ?? "").trim();
  const port = Math.max(1, Number(formData.get("port") ?? 465) || 465);
  let secure = formData.get("secure") === "on" || formData.get("secure") === "true";
  // Align TLS with common provider defaults
  if (port === 465) secure = true;
  if (port === 587) secure = false;
  const username = String(formData.get("username") ?? "").trim();
  const fromEmail = String(formData.get("fromEmail") ?? "").trim();
  const fromName = String(formData.get("fromName") ?? "").trim() || null;
  // Strip BOM / accidental paste whitespace — middle spaces kept if intentional
  const password = String(formData.get("password") ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
  const makeDefault = formData.get("isDefault") === "on" || formData.get("isDefault") === "true";

  if (!host || !username || !fromEmail) {
    throw new Error("REQUIRED_FIELDS");
  }

  return { label, host, port, secure, username, fromEmail, fromName, password, makeDefault };
}

async function setOnlyDefault(organizationId: string, accountId: string) {
  await prisma.$transaction([
    prisma.organizationEmailAccount.updateMany({
      where: { organizationId, NOT: { id: accountId } },
      data: { isDefault: false },
    }),
    prisma.organizationEmailAccount.update({
      where: { id: accountId },
      data: { isDefault: true },
    }),
  ]);
}

export async function createEmailAccountAction(formData: FormData): Promise<string> {
  const { session, membership } = await requireOrgWrite();
  const parsed = parseAccountForm(formData);
  if (!parsed.password.trim()) throw new Error("PASSWORD_REQUIRED");

  await ensureEmailAccountsMigrated(membership.organizationId);
  const count = await prisma.organizationEmailAccount.count({
    where: { organizationId: membership.organizationId },
  });
  const isDefault = parsed.makeDefault || count === 0;

  const account = await prisma.organizationEmailAccount.create({
    data: {
      organizationId: membership.organizationId,
      label: parsed.label,
      host: parsed.host,
      port: parsed.port,
      secure: parsed.secure,
      username: parsed.username,
      passwordEnc: encryptSmtpPassword(parsed.password),
      fromEmail: parsed.fromEmail,
      fromName: parsed.fromName,
      isDefault,
    },
  });

  if (isDefault) {
    await setOnlyDefault(membership.organizationId, account.id);
  }

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.email_account.created",
    entityType: "organization_email_account",
    entityId: account.id,
    after: {
      label: account.label,
      host: account.host,
      fromEmail: account.fromEmail,
      isDefault: account.isDefault,
    },
  });

  revalidatePath("/admin/einstellungen");
  revalidatePath("/admin/einstellungen/email");
  revalidatePath("/admin/stammdaten");
  return account.id;
}

export async function updateEmailAccountAction(formData: FormData): Promise<string> {
  const { session, membership } = await requireOrgWrite();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.organizationEmailAccount.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const parsed = parseAccountForm(formData);
  const data: {
    label: string;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromEmail: string;
    fromName: string | null;
    passwordEnc?: string;
  } = {
    label: parsed.label,
    host: parsed.host,
    port: parsed.port,
    secure: parsed.secure,
    username: parsed.username,
    fromEmail: parsed.fromEmail,
    fromName: parsed.fromName,
  };
  if (parsed.password.trim()) {
    data.passwordEnc = encryptSmtpPassword(parsed.password);
  }

  await prisma.organizationEmailAccount.update({
    where: { id },
    data,
  });

  if (parsed.makeDefault) {
    await setOnlyDefault(membership.organizationId, id);
  }

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.email_account.updated",
    entityType: "organization_email_account",
    entityId: id,
    after: {
      label: parsed.label,
      host: parsed.host,
      fromEmail: parsed.fromEmail,
      passwordUpdated: Boolean(parsed.password.trim()),
      madeDefault: parsed.makeDefault,
    },
  });

  revalidatePath("/admin/einstellungen");
  revalidatePath("/admin/einstellungen/email");
  return id;
}

export async function deleteEmailAccountAction(formData: FormData) {
  const { session, membership } = await requireOrgWrite();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.organizationEmailAccount.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  await prisma.organizationEmailAccount.delete({ where: { id } });

  if (existing.isDefault) {
    const next = await prisma.organizationEmailAccount.findFirst({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await setOnlyDefault(membership.organizationId, next.id);
    }
  }

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.email_account.deleted",
    entityType: "organization_email_account",
    entityId: id,
    before: { label: existing.label, fromEmail: existing.fromEmail },
  });

  revalidatePath("/admin/einstellungen");
  revalidatePath("/admin/einstellungen/email");
}

export async function setDefaultEmailAccountAction(formData: FormData) {
  const { session, membership } = await requireOrgWrite();
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.organizationEmailAccount.findFirst({
    where: { id, organizationId: membership.organizationId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  await setOnlyDefault(membership.organizationId, id);

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "org.email_account.set_default",
    entityType: "organization_email_account",
    entityId: id,
  });

  revalidatePath("/admin/einstellungen");
  revalidatePath("/admin/einstellungen/email");
}

export type SmtpTestState = {
  ok: boolean | null;
  message: string;
  /** Account was persisted before the SMTP check (save-and-test flow). */
  saved?: boolean;
};

function saveFailureMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "PASSWORD_REQUIRED") {
    return "Speichern fehlgeschlagen: Passwort ist erforderlich.";
  }
  if (code === "REQUIRED_FIELDS") {
    return "Speichern fehlgeschlagen: Host, Benutzer und From-E-Mail sind nötig.";
  }
  if (code === "NOT_FOUND") {
    return "Speichern fehlgeschlagen: Konto nicht gefunden.";
  }
  if (code === "FORBIDDEN") {
    return "Speichern fehlgeschlagen: Keine Berechtigung.";
  }
  return error instanceof Error
    ? `Speichern fehlgeschlagen: ${error.message}`
    : "Speichern fehlgeschlagen.";
}

/** Persist form (create or update), then test the saved account. */
export async function saveAndTestEmailAccountAction(
  _prev: SmtpTestState,
  formData: FormData,
): Promise<SmtpTestState> {
  try {
    const existingId = String(formData.get("id") ?? "").trim();
    let accountId: string;
    try {
      accountId = existingId
        ? await updateEmailAccountAction(formData)
        : await createEmailAccountAction(formData);
    } catch (error) {
      return { ok: false, message: saveFailureMessage(error), saved: false };
    }

    const { membership } = await requireOrgWrite();
    const result = await testEmailAccount({
      organizationId: membership.organizationId,
      accountId,
    });
    revalidatePath("/admin/einstellungen");
    revalidatePath("/admin/einstellungen/email");
    return {
      ok: result.ok,
      saved: true,
      message: `Gespeichert. ${result.message}`,
    };
  } catch (error) {
    return {
      ok: false,
      saved: true,
      message:
        error instanceof Error
          ? `Gespeichert, aber Prüfung fehlgeschlagen: ${error.message}`
          : "Gespeichert, aber Prüfung fehlgeschlagen.",
    };
  }
}

/** Test an already-saved account by id (no form-only / unsaved path). */
export async function testEmailAccountAction(
  _prev: SmtpTestState,
  formData: FormData,
): Promise<SmtpTestState> {
  try {
    const { membership } = await requireOrgWrite();
    const id = String(formData.get("id") ?? "").trim();

    if (!id) {
      return {
        ok: false,
        message: "Der Test ist fehlgeschlagen: Kein gespeichertes Konto ausgewählt.",
      };
    }

    const result = await testEmailAccount({
      organizationId: membership.organizationId,
      accountId: id,
    });
    revalidatePath("/admin/einstellungen");
    revalidatePath("/admin/einstellungen/email");
    return result;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Prüfung fehlgeschlagen",
    };
  }
}

export async function testDefaultEmailAccountAction(
  prev: SmtpTestState,
  formData: FormData,
): Promise<SmtpTestState> {
  void prev;
  void formData;
  try {
    const { membership } = await requireOrgWrite();
    await ensureEmailAccountsMigrated(membership.organizationId);
    const account = await prisma.organizationEmailAccount.findFirst({
      where: { organizationId: membership.organizationId, isDefault: true },
    });
    if (!account) {
      return {
        ok: false,
        message: "Kein Standard-E-Mail-Konto angelegt. Bitte unter E-Mail-Konten eines anlegen.",
      };
    }
    const result = await testEmailAccount({
      organizationId: membership.organizationId,
      accountId: account.id,
    });
    revalidatePath("/admin/einstellungen");
    revalidatePath("/admin/einstellungen/email");
    return result;
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Prüfung fehlgeschlagen",
    };
  }
}
