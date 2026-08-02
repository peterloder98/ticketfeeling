"use client";

import { useTransition } from "react";
import { updateCustomerAction } from "@/app/admin/kunden/actions";

type CustomerEditFormProps = {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    salutation: string | null;
    gender: string | null;
    phone: string | null;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
    country: string;
    birthDate: Date | string | null;
    notes: string | null;
  };
  canEdit: boolean;
};

function birthDateValue(value: Date | string | null): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function CustomerEditForm({ customer, canEdit }: CustomerEditFormProps) {
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <div className="space-y-2 text-sm text-[var(--muted)]">
        <p>
          {customer.salutation ? `${customer.salutation} ` : null}
          {customer.firstName} {customer.lastName}
        </p>
        {customer.phone ? <p>Telefon: {customer.phone}</p> : null}
        {(customer.street || customer.city) && (
          <p>
            {[customer.street, customer.houseNumber].filter(Boolean).join(" ")}
            {customer.street && customer.city ? ", " : ""}
            {[customer.postalCode, customer.city].filter(Boolean).join(" ")}
            {customer.country ? ` (${customer.country})` : ""}
          </p>
        )}
        {customer.notes ? (
          <div className="mt-3 rounded-lg border border-[var(--line)] p-3 whitespace-pre-wrap">
            {customer.notes}
          </div>
        ) : (
          <p className="mt-2 italic">Keine internen Notizen.</p>
        )}
        <p className="pt-2 text-xs">Bearbeiten erfordert Schreibrecht (org:write).</p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-3 text-sm sm:grid-cols-2"
      action={(formData) => {
        startTransition(async () => {
          await updateCustomerAction(formData);
        });
      }}
    >
      <input type="hidden" name="customerId" value={customer.id} />
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Anrede</span>
        <input
          name="salutation"
          defaultValue={customer.salutation ?? ""}
          className="tf-input"
          placeholder="Herr / Frau / …"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Geschlecht</span>
        <select name="gender" defaultValue={customer.gender ?? ""} className="tf-input">
          <option value="">—</option>
          <option value="female">weiblich</option>
          <option value="male">männlich</option>
          <option value="diverse">divers</option>
          <option value="undisclosed">keine Angabe</option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Vorname</span>
        <input name="firstName" defaultValue={customer.firstName} required className="tf-input" />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Nachname</span>
        <input name="lastName" defaultValue={customer.lastName} required className="tf-input" />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Telefon</span>
        <input name="phone" defaultValue={customer.phone ?? ""} className="tf-input" />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Geburtsdatum</span>
        <input
          type="date"
          name="birthDate"
          defaultValue={birthDateValue(customer.birthDate)}
          className="tf-input"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Straße</span>
        <input name="street" defaultValue={customer.street ?? ""} className="tf-input" />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Hausnummer</span>
        <input name="houseNumber" defaultValue={customer.houseNumber ?? ""} className="tf-input" />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">PLZ</span>
        <input name="postalCode" defaultValue={customer.postalCode ?? ""} className="tf-input" />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Ort</span>
        <input name="city" defaultValue={customer.city ?? ""} className="tf-input" />
      </label>
      <label className="grid gap-1 sm:col-span-2">
        <span className="text-[var(--muted)]">Land</span>
        <input name="country" defaultValue={customer.country || "DE"} className="tf-input" />
      </label>
      <label className="grid gap-1 sm:col-span-2">
        <span className="text-[var(--muted)]">Interne Notizen</span>
        <textarea
          name="notes"
          defaultValue={customer.notes ?? ""}
          rows={4}
          className="tf-input min-h-[6rem]"
          placeholder="Hinweise zum Kunden (nur intern)…"
        />
      </label>
      <div className="sm:col-span-2">
        <button type="submit" className="tf-btn tf-btn-primary !py-2 text-sm" disabled={pending}>
          {pending ? "Speichern…" : "Stammdaten speichern"}
        </button>
      </div>
    </form>
  );
}
