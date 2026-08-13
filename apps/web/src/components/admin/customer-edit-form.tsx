"use client";

import { useState, useTransition } from "react";
import { updateCustomerAction } from "@/app/admin/kunden/actions";
import { SmartDateInput } from "@/components/admin/smart-date-input";
import { CountrySelect } from "@/components/country-select";
import { PhoneInput } from "@/components/phone-input";
import {
  STREET_NO_NUMBERS_MESSAGE,
  POSTAL_CODE_DIGITS_ONLY_MESSAGE,
  filterPostalCodeInput,
  filterStreetNameInput,
} from "@/lib/commerce/address";

type CustomerEditFormProps = {
  customer: {
    id: string;
    firstName: string;
    lastName: string;
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

function genderLabel(gender: string | null): string | null {
  switch (gender) {
    case "female":
      return "weiblich";
    case "male":
      return "männlich";
    case "diverse":
      return "divers";
    case "undisclosed":
      return "keine Angabe";
    default:
      return null;
  }
}

export function CustomerEditForm({ customer, canEdit }: CustomerEditFormProps) {
  const [pending, startTransition] = useTransition();
  const [street, setStreet] = useState(customer.street ?? "");
  const [streetHint, setStreetHint] = useState<string | null>(null);
  const [postalCode, setPostalCode] = useState(customer.postalCode ?? "");
  const [postalHint, setPostalHint] = useState<string | null>(null);

  if (!canEdit) {
    return (
      <div className="space-y-2 text-sm text-[var(--muted)]">
        <p>
          {customer.firstName} {customer.lastName}
          {genderLabel(customer.gender) ? ` · ${genderLabel(customer.gender)}` : null}
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
        <span className="text-[var(--muted)]">Geschlecht</span>
        <select name="gender" defaultValue={customer.gender ?? ""} className="tf-input">
          <option value="">—</option>
          <option value="female">weiblich</option>
          <option value="male">männlich</option>
          <option value="diverse">divers</option>
          <option value="undisclosed">keine Angabe</option>
        </select>
      </label>
      <div className="hidden sm:block" aria-hidden />
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Vorname</span>
        <input name="firstName" defaultValue={customer.firstName} required className="tf-input" />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Nachname</span>
        <input name="lastName" defaultValue={customer.lastName} required className="tf-input" />
      </label>
      <div className="sm:col-span-2">
        <PhoneInput name="phone" label="Telefon" defaultValue={customer.phone ?? ""} />
      </div>
      <SmartDateInput
        name="birthDate"
        label="Geburtsdatum"
        defaultValue={birthDateValue(customer.birthDate)}
      />
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Straße</span>
        <input
          name="street"
          value={street}
          onChange={(e) => {
            const raw = e.target.value;
            const filtered = filterStreetNameInput(raw);
            setStreet(filtered);
            setStreetHint(raw !== filtered ? STREET_NO_NUMBERS_MESSAGE : null);
          }}
          className="tf-input"
        />
        {streetHint ? <p className="text-xs text-[var(--danger)]">{streetHint}</p> : null}
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Hausnummer</span>
        <input name="houseNumber" defaultValue={customer.houseNumber ?? ""} className="tf-input" />
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">PLZ</span>
        <input
          name="postalCode"
          inputMode="numeric"
          maxLength={5}
          value={postalCode}
          onChange={(e) => {
            const raw = e.target.value;
            const filtered = filterPostalCodeInput(raw);
            setPostalCode(filtered);
            setPostalHint(raw !== filtered ? POSTAL_CODE_DIGITS_ONLY_MESSAGE : null);
          }}
          className="tf-input"
        />
        {postalHint ? <p className="text-xs text-[var(--danger)]">{postalHint}</p> : null}
      </label>
      <label className="grid gap-1">
        <span className="text-[var(--muted)]">Ort</span>
        <input name="city" defaultValue={customer.city ?? ""} className="tf-input" />
      </label>
      <div className="sm:col-span-2">
        <CountrySelect name="country" label="Land" defaultValue={customer.country || "DE"} />
      </div>
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
