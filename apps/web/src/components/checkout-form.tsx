"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { PhoneInput } from "@/components/phone-input";
import { CheckoutPaymentMethods } from "@/components/checkout-payment-methods";
import { SmartDateInput } from "@/components/admin/smart-date-input";
import { useCart } from "@/components/cart-context";
import { cartFetch } from "@/lib/commerce/cart-client";
import type { CheckoutPaymentOption, PaymentMethodKey } from "@/lib/commerce/payment-fees";
import {
  STREET_NO_NUMBERS_MESSAGE,
  filterStreetNameInput,
  streetContainsDigits,
} from "@/lib/commerce/address";

type Mode = "guest" | "register";

type FieldKey =
  | "email"
  | "password"
  | "firstName"
  | "lastName"
  | "street"
  | "houseNumber"
  | "postalCode"
  | "city"
  | "paymentMethod"
  | "acceptLegal"
  | "invoiceCompanyName";

function checkoutErrorMessage(code: string) {
  switch (code) {
    case "ACCOUNT_EXISTS":
      return "Zu dieser E-Mail gibt es schon ein Konto. Bitte anmelden.";
    case "PASSWORD_REQUIRED":
      return "Bitte ein Passwort mit mindestens 8 Zeichen wählen.";
    case "CART_EMPTY":
      return "Warenkorb ist leer.";
    case "CART_EXPIRED":
      return "Reservierung abgelaufen — bitte erneut in den Warenkorb legen.";
    case "HOLD_EXPIRED":
      return "Deine Platzreservierung ist abgelaufen — bitte die Plätze neu wählen.";
    case "TERMS_REQUIRED":
    case "PRIVACY_REQUIRED":
    case "WITHDRAWAL_ACK_REQUIRED":
      return "Bitte AGB, Datenschutz und Widerruf bestätigen.";
    case "PAYMENT_METHOD_REQUIRED":
      return "Bitte eine Zahlungsart wählen.";
    case "PAYMENT_METHOD_UNAVAILABLE":
      return "Diese Zahlungsart ist gerade nicht verfügbar.";
    case "VALIDATION":
      return "Bitte die rot markierten Felder ausfüllen.";
    case "STREET_NO_NUMBERS":
      return STREET_NO_NUMBERS_MESSAGE;
    case "INVOICE_COMPANY_REQUIRED":
      return "Bitte den Firmennamen für die Rechnung angeben.";
    case "INVOICE_FIELDS_REQUIRED":
      return "Für die Rechnung bitte Adresse und alle Pflichtfelder ausfüllen.";
    default:
      return code || "Checkout fehlgeschlagen";
  }
}

function inputClass(hasError: boolean) {
  return hasError
    ? "tf-input !border-[var(--danger)] !ring-2 !ring-[rgba(220,38,38,0.25)]"
    : "tf-input";
}

function RequiredMark() {
  return (
    <span className="text-[var(--danger)]" aria-hidden>
      {" "}
      *
    </span>
  );
}

export function CheckoutForm({
  isLoggedIn = false,
  isStaff = false,
  loginEmail,
  paymentOptions,
  customerTotalCents,
  embed = false,
  eventHref,
}: {
  isLoggedIn?: boolean;
  isStaff?: boolean;
  loginEmail?: string | null;
  paymentOptions: CheckoutPaymentOption[];
  customerTotalCents: number;
  /** Keep payment + tickets inside the embed iframe */
  embed?: boolean;
  /** Used for HOLD_EXPIRED → back to event / saalplan */
  eventHref?: string | null;
}) {
  const router = useRouter();
  const { bump } = useCart();
  const formRef = useRef<HTMLFormElement>(null);
  const [mode, setMode] = useState<Mode>("guest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [cityAuto, setCityAuto] = useState(false);
  const [cityHint, setCityHint] = useState<string | null>(null);
  // Never auto-select — customer must choose a payment method consciously.
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodKey | null>(null);
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const [invoiceRecipientType, setInvoiceRecipientType] = useState<"private" | "company">(
    "private",
  );
  const [street, setStreet] = useState("");
  const [streetHint, setStreetHint] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceRequested || postalCode.length !== 5) {
      setCityHint(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/geo/postal-code?country=DE&code=${postalCode}`);
        const data = await res.json();
        if (cancelled) return;
        if (data?.city) {
          setCity(String(data.city));
          setCityAuto(true);
          setCityHint(`Ort erkannt: ${data.city}`);
        } else {
          setCityHint("Ort nicht gefunden — bitte manuell eintragen");
        }
      } catch {
        if (!cancelled) setCityHint("Ort nicht gefunden — bitte manuell eintragen");
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [postalCode, invoiceRequested]);

  function clearFieldError(key: FieldKey) {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validate(form: HTMLFormElement): Partial<Record<FieldKey, boolean>> {
    const fd = new FormData(form);
    const errors: Partial<Record<FieldKey, boolean>> = {};
    const email = String(fd.get("email") ?? "").trim();
    if (!email) errors.email = true;
    if (mode === "register" && (!isLoggedIn || isStaff)) {
      const password = String(fd.get("password") ?? "");
      if (password.length < 8) errors.password = true;
    }
    if (!String(fd.get("firstName") ?? "").trim()) errors.firstName = true;
    if (!String(fd.get("lastName") ?? "").trim()) errors.lastName = true;
    if (!paymentMethod) errors.paymentMethod = true;
    if (fd.get("acceptLegal") !== "on") errors.acceptLegal = true;
    if (invoiceRequested) {
      const streetValue = String(fd.get("street") ?? "").trim();
      if (!streetValue || streetContainsDigits(streetValue)) errors.street = true;
      if (!String(fd.get("houseNumber") ?? "").trim()) errors.houseNumber = true;
      if (!/^\d{5}$/.test(postalCode)) errors.postalCode = true;
      if (!city.trim()) errors.city = true;
      if (invoiceRecipientType === "company") {
        if (!String(fd.get("invoiceCompanyName") ?? "").trim()) errors.invoiceCompanyName = true;
      }
    }
    return errors;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrorCode(null);
    const form = event.currentTarget;
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const streetValue = String(new FormData(form).get("street") ?? "").trim();
      if (errors.street && streetValue && streetContainsDigits(streetValue)) {
        setError(checkoutErrorMessage("STREET_NO_NUMBERS"));
        setStreetHint(STREET_NO_NUMBERS_MESSAGE);
      } else if (errors.invoiceCompanyName) {
        setError(checkoutErrorMessage("INVOICE_COMPANY_REQUIRED"));
      } else if (
        invoiceRequested &&
        (errors.street || errors.houseNumber || errors.postalCode || errors.city)
      ) {
        setError(checkoutErrorMessage("INVOICE_FIELDS_REQUIRED"));
      } else {
        setError(checkoutErrorMessage("VALIDATION"));
      }
      setLoading(false);
      const firstKey = Object.keys(errors)[0];
      const el =
        form.querySelector<HTMLElement>(`[name="${firstKey}"]`) ??
        form.querySelector<HTMLElement>(`#${firstKey}`) ??
        form.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el && "focus" in el) (el as HTMLElement).focus?.();
      return;
    }

    const fd = new FormData(form);
    const email = String(fd.get("email"));
    const password = String(fd.get("password") || "");
    const effectiveMode: Mode = isLoggedIn && !isStaff ? "register" : mode;
    const forceGuestStaff = isStaff && mode === "guest";

    const payload = {
      checkoutMode: forceGuestStaff ? "guest" : effectiveMode,
      paymentMethod,
      email: forceGuestStaff ? email : isLoggedIn && !isStaff ? email : email,
      password:
        !forceGuestStaff && effectiveMode === "register" && !(isLoggedIn && !isStaff)
          ? password
          : undefined,
      firstName: String(fd.get("firstName")),
      lastName: String(fd.get("lastName")),
      birthDate: String(fd.get("birthDate") || "") || undefined,
      street: invoiceRequested ? String(fd.get("street") || "") : "",
      houseNumber: invoiceRequested ? String(fd.get("houseNumber") || "") : "",
      postalCode: invoiceRequested ? postalCode : "",
      city: invoiceRequested ? city : "",
      country: "DE",
      phone: String(fd.get("phone") || "") || undefined,
      acceptTerms: true,
      acknowledgePrivacy: true,
      acknowledgeNoWithdrawal: true,
      invoiceRequested,
      invoiceRecipientType: invoiceRequested ? invoiceRecipientType : undefined,
      invoiceCompanyName: invoiceRequested
        ? String(fd.get("invoiceCompanyName") || "") || undefined
        : undefined,
      invoiceContactName: invoiceRequested
        ? String(fd.get("invoiceContactName") || "") || undefined
        : undefined,
      invoiceVatId: invoiceRequested
        ? String(fd.get("invoiceVatId") || "") || undefined
        : undefined,
      invoiceOrderReference: invoiceRequested
        ? String(fd.get("invoiceOrderReference") || "") || undefined
        : undefined,
    };

    try {
      const response = await cartFetch("/api/v1/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          preferGuest: forceGuestStaff,
          embed,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const code = String(data?.error?.code ?? "");
        setErrorCode(code);
        setError(checkoutErrorMessage(code));
        return;
      }

      if (data.createdAccount && password) {
        await signIn("credentials", { email, password, redirect: false });
      }

      // Clear cart badge / reminder immediately — don't wait for the next poll.
      bump({ itemCount: 0, expiresAt: null, grossFormatted: null });
      const payUrl =
        typeof data.payUrl === "string"
          ? data.payUrl
          : embed
            ? `/embed/checkout/pay/${data.orderId}`
            : `/checkout/pay/${data.orderId}`;
      router.push(payUrl);
    } finally {
      setLoading(false);
    }
  }

  const showAccountChoice = !isLoggedIn || isStaff;
  const holdExpired = errorCode === "HOLD_EXPIRED" || errorCode === "CART_EXPIRED";
  const reselectHref =
    eventHref ??
    (embed ? "/embed/shop" : "/events");

  return (
    <form
      ref={formRef}
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      className="rounded-[20px] border border-[var(--tf-line)] bg-white p-5 shadow-[0_8px_28px_rgba(15,39,71,0.05)] md:p-6"
    >
      {isStaff ? (
        <div className="mb-5 rounded-[16px] border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] p-4 text-sm text-[var(--tf-navy)]">
          <p className="font-semibold">Du bist als Mitarbeiter angemeldet</p>
          <p className="mt-1 text-[var(--tf-text-secondary)]">
            Für einen normalen Kundentest: als Gast kaufen (unten) — oder{" "}
            <Link
              href={
                embed
                  ? "/api/auth/signout?callbackUrl=/embed/checkout"
                  : "/api/auth/signout?callbackUrl=/checkout"
              }
              className="font-medium underline"
            >
              abmelden
            </Link>{" "}
            und den Kauf ohne Admin-Konto durchführen.
          </p>
        </div>
      ) : null}

      {showAccountChoice ? (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Wie möchtest du kaufen?</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Gastkauf ohne Konto — oder schnell registrieren für später.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("guest")}
              className={`rounded-[16px] border px-4 py-3 text-left transition ${
                mode === "guest"
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.1)]"
                  : "border-[var(--tf-line)] hover:border-[var(--tf-teal)]"
              }`}
            >
              <p className="font-semibold text-[var(--tf-navy)]">Als Gast kaufen</p>
              <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                Schnell — Daten nur für diese Bestellung
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-[16px] border px-4 py-3 text-left transition ${
                mode === "register"
                  ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.1)]"
                  : "border-[var(--tf-line)] hover:border-[var(--tf-teal)]"
              }`}
            >
              <p className="font-semibold text-[var(--tf-navy)]">Konto anlegen</p>
              <p className="mt-1 text-xs text-[var(--tf-text-secondary)]">
                E-Mail + Passwort — für spätere Käufe
              </p>
            </button>
          </div>
          {!isLoggedIn && !embed ? (
            <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">
              Schon ein Konto?{" "}
              <Link
                href="/login?callbackUrl=/checkout"
                className="font-medium text-[var(--tf-teal-hover)] underline"
              >
                Anmelden
              </Link>
            </p>
          ) : null}
          {!isLoggedIn && embed ? (
            <p className="mt-3 text-sm text-[var(--tf-text-secondary)]">
              Im eingebetteten Shop am einfachsten als Gast kaufen.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Ihre Daten</h2>
          <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
            Angemeldet als {loginEmail ?? "Konto"}
          </p>
        </div>
      )}

      <p className="mb-3 text-xs text-[var(--tf-text-secondary)]">
        Pflichtfelder sind mit <span className="text-[var(--danger)]">*</span> markiert.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="tf-label" htmlFor="email">
            E-Mail
            <RequiredMark />
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className={inputClass(Boolean(fieldErrors.email))}
            autoComplete="email"
            defaultValue={isStaff ? "" : (loginEmail ?? "")}
            readOnly={isLoggedIn && !isStaff}
            onChange={() => clearFieldError("email")}
          />
        </div>

        {mode === "register" && (!isLoggedIn || isStaff) ? (
          <div className="md:col-span-2">
            <label className="tf-label" htmlFor="password">
              Passwort (min. 8 Zeichen)
              <RequiredMark />
            </label>
            <input
              id="password"
              name="password"
              type="password"
              minLength={8}
              className={inputClass(Boolean(fieldErrors.password))}
              autoComplete="new-password"
              placeholder="Für Ihr Ticketfeeling-Konto"
              onChange={() => clearFieldError("password")}
            />
          </div>
        ) : null}

        <div>
          <label className="tf-label" htmlFor="firstName">
            Vorname
            <RequiredMark />
          </label>
          <input
            id="firstName"
            name="firstName"
            className={inputClass(Boolean(fieldErrors.firstName))}
            autoComplete="given-name"
            onChange={() => clearFieldError("firstName")}
          />
        </div>
        <div>
          <label className="tf-label" htmlFor="lastName">
            Nachname
            <RequiredMark />
          </label>
          <input
            id="lastName"
            name="lastName"
            className={inputClass(Boolean(fieldErrors.lastName))}
            autoComplete="family-name"
            onChange={() => clearFieldError("lastName")}
          />
        </div>
        <SmartDateInput name="birthDate" label="Geburtsdatum (optional)" />
        <div className="md:col-span-2">
          <PhoneInput name="phone" label="Telefon (optional)" />
        </div>
      </div>

      {mode === "guest" ? (
        <p className="mt-4 text-xs text-[var(--tf-text-secondary)]">
          Als Gast wird kein Login-Konto angelegt.
        </p>
      ) : null}

      <div
        className={`mt-8 rounded-[18px] ${
          fieldErrors.paymentMethod
            ? "ring-2 ring-[rgba(220,38,38,0.35)] ring-offset-2"
            : ""
        }`}
        data-field="paymentMethod"
      >
        <CheckoutPaymentMethods
          options={paymentOptions}
          value={paymentMethod}
          onChange={(key) => {
            setPaymentMethod(key);
            clearFieldError("paymentMethod");
          }}
          customerTotalCents={customerTotalCents}
        />
        {fieldErrors.paymentMethod ? (
          <p className="mt-2 text-xs text-[var(--danger)]">Bitte eine Zahlungsart wählen.</p>
        ) : null}
      </div>

      <div className="mt-8 space-y-3 rounded-[18px] border border-[var(--tf-line)] bg-white p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--tf-navy)]">
          <input
            type="checkbox"
            checked={invoiceRequested}
            onChange={(e) => setInvoiceRequested(e.target.checked)}
          />
          Ich benötige eine Rechnung
        </label>
        {invoiceRequested ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="text-xs leading-relaxed text-[var(--tf-text-secondary)] sm:col-span-2">
              Für die Rechnung brauchen wir deine Adresse. Nach dem Kauf schicken wir dir die
              Rechnung als PDF.
            </p>
            <div>
              <label className="tf-label" htmlFor="street">
                Straße
                <RequiredMark />
              </label>
              <input
                id="street"
                name="street"
                className={inputClass(Boolean(fieldErrors.street))}
                autoComplete="address-line1"
                value={street}
                onChange={(e) => {
                  const raw = e.target.value;
                  const filtered = filterStreetNameInput(raw);
                  setStreet(filtered);
                  if (raw !== filtered) {
                    setStreetHint(STREET_NO_NUMBERS_MESSAGE);
                  } else if (streetHint) {
                    setStreetHint(null);
                  }
                  clearFieldError("street");
                }}
              />
              {streetHint || fieldErrors.street ? (
                <p className="mt-1 text-xs text-[var(--danger)]">
                  {streetHint ||
                    (street.trim() && streetContainsDigits(street)
                      ? STREET_NO_NUMBERS_MESSAGE
                      : "Bitte Straße angeben.")}
                </p>
              ) : null}
            </div>
            <div>
              <label className="tf-label" htmlFor="houseNumber">
                Hausnummer
                <RequiredMark />
              </label>
              <input
                id="houseNumber"
                name="houseNumber"
                className={inputClass(Boolean(fieldErrors.houseNumber))}
                onChange={() => clearFieldError("houseNumber")}
              />
            </div>
            <div>
              <label className="tf-label" htmlFor="postalCode">
                PLZ
                <RequiredMark />
              </label>
              <input
                id="postalCode"
                name="postalCode"
                inputMode="numeric"
                pattern="[0-9]{5}"
                maxLength={5}
                className={inputClass(Boolean(fieldErrors.postalCode))}
                autoComplete="postal-code"
                value={postalCode}
                onChange={(e) => {
                  setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5));
                  setCityAuto(false);
                  clearFieldError("postalCode");
                }}
              />
            </div>
            <div>
              <label className="tf-label" htmlFor="city">
                Ort
                <RequiredMark />
              </label>
              <input
                id="city"
                name="city"
                className={inputClass(Boolean(fieldErrors.city))}
                autoComplete="address-level2"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setCityAuto(false);
                  setCityHint(null);
                  clearFieldError("city");
                }}
              />
              {cityHint ? (
                <p
                  className={`mt-1 text-xs ${cityAuto ? "text-[var(--tf-teal-hover)]" : "text-[var(--tf-text-secondary)]"}`}
                >
                  {cityHint}
                </p>
              ) : null}
            </div>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span>
                Empfänger
                <RequiredMark />
              </span>
              <select
                className="tf-input"
                value={invoiceRecipientType}
                onChange={(e) =>
                  setInvoiceRecipientType(e.target.value === "company" ? "company" : "private")
                }
              >
                <option value="private">Privatperson</option>
                <option value="company">Unternehmen</option>
              </select>
            </label>
            {invoiceRecipientType === "company" ? (
              <>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span>
                    Firmenname
                    <RequiredMark />
                  </span>
                  <input
                    name="invoiceCompanyName"
                    className={inputClass(Boolean(fieldErrors.invoiceCompanyName))}
                    onChange={() => clearFieldError("invoiceCompanyName")}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Ansprechpartner</span>
                  <input name="invoiceContactName" className="tf-input" />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>USt-IdNr. (optional)</span>
                  <input name="invoiceVatId" className="tf-input" placeholder="DE123456789" />
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span>Bestellreferenz (optional)</span>
                  <input name="invoiceOrderReference" className="tf-input" />
                </label>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-[16px] border border-[var(--tf-line)] bg-[rgba(15,39,71,0.03)] p-4 text-sm text-[var(--tf-text-secondary)]">
        <p className="font-semibold text-[var(--tf-navy)]">Hinweis zum Widerruf</p>
        <p className="mt-1.5 leading-relaxed">
          Für termingebundene Eintrittskarten besteht kein gesetzliches Widerrufsrecht. Details in
          der{" "}
          <Link
            href="/recht/rueckerstattung"
            className="font-medium text-[var(--tf-teal-hover)] underline"
          >
            Rückerstattungsrichtlinie
          </Link>
          .
        </p>
      </div>

      <div
        className={`mt-5 space-y-3 rounded-[16px] border-2 p-4 ${
          fieldErrors.acceptLegal
            ? "border-[var(--danger)] bg-[rgba(220,38,38,0.04)]"
            : "border-[var(--tf-navy)]/15 bg-[rgba(15,39,71,0.03)]"
        }`}
        data-field="acceptLegal"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--tf-navy)]">
          Bitte lesen und bestätigen <span className="text-[var(--danger)]">*</span>
        </p>
        {fieldErrors.acceptLegal ? (
          <p className="text-xs font-medium text-[var(--danger)]">
            Bitte bestätigen, um fortzufahren.
          </p>
        ) : null}
        <label
          className={`flex items-start gap-3 text-sm ${
            fieldErrors.acceptLegal ? "text-[var(--danger)]" : "text-[var(--tf-navy)]"
          }`}
        >
          <input
            type="checkbox"
            name="acceptLegal"
            className={`mt-1 h-4 w-4 accent-[var(--tf-teal)] ${
              fieldErrors.acceptLegal ? "outline outline-2 outline-[var(--danger)]" : ""
            }`}
            onChange={() => clearFieldError("acceptLegal")}
          />
          <span>
            Ich akzeptiere die{" "}
            <Link
              href="/recht/agb"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[var(--tf-teal-hover)] underline decoration-2 underline-offset-2 hover:text-[var(--tf-navy)]"
            >
              AGB
            </Link>
            , die{" "}
            <Link
              href="/recht/datenschutz"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[var(--tf-teal-hover)] underline decoration-2 underline-offset-2 hover:text-[var(--tf-navy)]"
            >
              Datenschutzerklärung
            </Link>{" "}
            und bestätige, dass für diese Tickets kein Widerrufsrecht besteht (
            <Link
              href="/recht/widerruf"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[var(--tf-teal-hover)] underline decoration-2 underline-offset-2 hover:text-[var(--tf-navy)]"
            >
              Widerruf
            </Link>
            ).
          </span>
        </label>
      </div>

      {error ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-[var(--danger)]">{error}</p>
          {holdExpired ? (
            <Link href={reselectHref} className="tf-btn tf-btn-primary inline-flex !min-h-10 text-sm">
              Plätze neu wählen
            </Link>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        className="tf-btn tf-btn-primary mt-6 w-full !min-h-12 text-base"
        disabled={loading || !paymentMethod}
        aria-disabled={loading || !paymentMethod}
      >
        {loading
          ? "Wird erstellt…"
          : !paymentMethod
            ? "Bitte Zahlungsart wählen"
            : mode === "register"
              ? "Konto anlegen & zahlungspflichtig bestellen"
              : "Zahlungspflichtig bestellen"}
      </button>
    </form>
  );
}
