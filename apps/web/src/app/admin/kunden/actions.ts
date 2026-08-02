"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDefaultOrganizationForUser, userHasPermission } from "@/lib/rbac";

async function requireCustomerWrite() {
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

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s.length ? s : null;
}

export async function updateCustomerAction(formData: FormData) {
  const { session, membership } = await requireCustomerWrite();
  const customerId = String(formData.get("customerId") ?? "").trim();
  if (!customerId) throw new Error("CUSTOMER_REQUIRED");

  const existing = await prisma.customer.findFirst({
    where: { id: customerId, organizationId: membership.organizationId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const firstName = String(formData.get("firstName") ?? "").trim() || existing.firstName;
  const lastName = String(formData.get("lastName") ?? "").trim() || existing.lastName;
  const salutation = emptyToNull(formData.get("salutation"));
  const phone = emptyToNull(formData.get("phone"));
  const street = emptyToNull(formData.get("street"));
  const houseNumber = emptyToNull(formData.get("houseNumber"));
  const postalCode = emptyToNull(formData.get("postalCode"));
  const city = emptyToNull(formData.get("city"));
  const country = String(formData.get("country") ?? "").trim() || existing.country || "DE";
  const gender = emptyToNull(formData.get("gender"));
  const notes = emptyToNull(formData.get("notes"));
  const birthRaw = String(formData.get("birthDate") ?? "").trim();
  let birthDate: Date | null = null;
  if (birthRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthRaw)) {
    birthDate = new Date(`${birthRaw}T12:00:00.000Z`);
  }

  const before = {
    firstName: existing.firstName,
    lastName: existing.lastName,
    salutation: existing.salutation,
    phone: existing.phone,
    street: existing.street,
    houseNumber: existing.houseNumber,
    postalCode: existing.postalCode,
    city: existing.city,
    country: existing.country,
    gender: existing.gender,
    birthDate: existing.birthDate,
    notes: existing.notes,
  };

  const after = {
    firstName,
    lastName,
    salutation,
    phone,
    street,
    houseNumber,
    postalCode,
    city,
    country,
    gender,
    birthDate,
    notes,
  };

  await prisma.customer.update({
    where: { id: existing.id },
    data: after,
  });

  await writeAudit({
    organizationId: membership.organizationId,
    actorUserId: session.user.id,
    action: "customer.updated",
    entityType: "customer",
    entityId: existing.id,
    before,
    after,
  });

  revalidatePath("/admin/kunden");
  revalidatePath(`/admin/kunden/${existing.id}`);
}
