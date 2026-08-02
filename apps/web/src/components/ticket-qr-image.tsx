"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function TicketQrImage({
  token,
  size = 220,
  label = "QR-Code zum Einlass",
  showToken = false,
}: {
  token: string;
  size?: number;
  label?: string;
  /** Debug only — never show raw scan tokens in cashier UI */
  showToken?: boolean;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setDataUrl(null);
      setError(null);
      return;
    }

    let active = true;
    setDataUrl(null);
    setError(null);

    void QRCode.toDataURL(token, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0b1220", light: "#ffffff" },
    })
      .then((url) => {
        if (!active) return;
        setDataUrl(url);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "QR fehlgeschlagen");
      });

    return () => {
      active = false;
    };
  }, [token, size]);

  if (!token) {
    return <p className="text-sm text-[var(--danger)]">Kein Scan-Token vorhanden.</p>;
  }

  return (
    <div className="rounded-2xl bg-white p-4 text-center text-black">
      <p className="text-xs uppercase tracking-wider text-black/60">{label}</p>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="Ticket QR-Code"
          width={size}
          height={size}
          className="mx-auto mt-3"
        />
      ) : error ? (
        <p className="mt-3 text-sm text-[var(--danger)]">QR konnte nicht erzeugt werden.</p>
      ) : (
        <div
          className="mx-auto mt-3 animate-pulse rounded-lg bg-black/5"
          style={{ width: size, height: size }}
          aria-label="QR wird erzeugt"
        />
      )}
      {showToken ? (
        <p className="mt-3 break-all font-mono text-[10px] leading-relaxed text-black/55">
          {token}
        </p>
      ) : null}
    </div>
  );
}
