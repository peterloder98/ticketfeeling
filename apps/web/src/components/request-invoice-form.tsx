"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  orderId: string;
  accessToken?: string | null;
  defaultStreet?: string;
  defaultHouseNumber?: string;
  defaultPostalCode?: string;
  defaultCity?: string;
};

export function RequestInvoiceForm({
  orderId,
  accessToken,
  defaultStreet = "",
  defaultHouseNumber = "",
  defaultPostalCode = "",
  defaultCity = "",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [recipientType, setRecipientType] = useState<"private" | "company">("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      recipientType,
      street: String(fd.get("street") ?? "").trim(),
      houseNumber: String(fd.get("houseNumber") ?? "").trim(),
      postalCode: String(fd.get("postalCode") ?? "").trim(),
      city: String(fd.get("city") ?? "").trim(),
      country: "DE",
      companyName: String(fd.get("companyName") ?? "").trim() || undefined,
      contactName: String(fd.get("contactName") ?? "").trim() || undefined,
      vatId: String(fd.get("vatId") ?? "").trim() || undefined,
      orderReference: String(fd.get("orderReference") ?? "").trim() || undefined,
    };

    try {
      const qs = accessToken ? `?t=${encodeURIComponent(accessToken)}` : "";
      const res = await fetch(`/api/v1/account/orders/${orderId}/request-invoice${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.code ?? "REQUEST_FAILED");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anforderung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs leading-relaxed text-[var(--tf-text-secondary)]">
          Keine Rechnung angefordert. Du kannst sie hier nachträglich anfordern.
        </p>
        <button
          type="button"
          className="tf-btn tf-btn-secondary inline-flex !py-2 text-xs"
          onClick={() => setOpen(true)}
        >
          Rechnung anfordern
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="mt-3 space-y-3">
      <p className="text-xs leading-relaxed text-[var(--tf-text-secondary)]">
        Für die Rechnung brauchen wir deine Adresse. Danach kannst du das PDF hier herunterladen.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs sm:col-span-2">
          <span className="text-[var(--tf-text-secondary)]">Empfänger</span>
          <select
            className="tf-input"
            value={recipientType}
            onChange={(e) =>
              setRecipientType(e.target.value === "company" ? "company" : "private")
            }
          >
            <option value="private">Privatperson</option>
            <option value="company">Unternehmen</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-[var(--tf-text-secondary)]">Straße</span>
          <input name="street" required className="tf-input" defaultValue={defaultStreet} />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-[var(--tf-text-secondary)]">Hausnummer</span>
          <input
            name="houseNumber"
            required
            className="tf-input"
            defaultValue={defaultHouseNumber}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-[var(--tf-text-secondary)]">PLZ</span>
          <input
            name="postalCode"
            required
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            className="tf-input"
            defaultValue={defaultPostalCode}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-[var(--tf-text-secondary)]">Ort</span>
          <input name="city" required className="tf-input" defaultValue={defaultCity} />
        </label>
        {recipientType === "company" ? (
          <>
            <label className="grid gap-1 text-xs sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Firmenname</span>
              <input name="companyName" required className="tf-input" />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-[var(--tf-text-secondary)]">Ansprechpartner</span>
              <input name="contactName" className="tf-input" />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-[var(--tf-text-secondary)]">USt-IdNr. (optional)</span>
              <input name="vatId" className="tf-input" placeholder="DE123456789" />
            </label>
            <label className="grid gap-1 text-xs sm:col-span-2">
              <span className="text-[var(--tf-text-secondary)]">Bestellreferenz (optional)</span>
              <input name="orderReference" className="tf-input" />
            </label>
          </>
        ) : null}
      </div>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="tf-btn tf-btn-primary !py-2 text-xs" disabled={busy}>
          {busy ? "Wird angefordert…" : "Rechnung anfordern"}
        </button>
        <button
          type="button"
          className="tf-btn tf-btn-secondary !py-2 text-xs"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}
