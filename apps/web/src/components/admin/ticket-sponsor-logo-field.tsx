"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-image";

/** Display hint — must match server SPONSOR_LOGO_MAX_* in optimize-sponsor-logo. */
const SPONSOR_LOGO_MAX_WIDTH = 480;
const SPONSOR_LOGO_MAX_HEIGHT = 160;

type SponsorField = "ticketSponsorLogoAboveUrl" | "ticketSponsorLogoBelowUrl";

type Props = {
  field: SponsorField;
  label: string;
  eventId: string;
  initialUrl?: string | null;
  hint?: string;
};

export function TicketSponsorLogoField({
  field,
  label,
  eventId,
  initialUrl,
  hint,
}: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(initialUrl ?? "");
  }, [initialUrl]);

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bilddatei wählen (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Maximal 8 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file, file.name || "sponsor-logo.png");
      body.append("field", field);
      body.append("eventId", eventId);

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 45_000);
      let res: Response;
      try {
        res = await fetch("/api/v1/admin/uploads/ticket-sponsor", {
          method: "POST",
          body,
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timer);
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.code ?? "UPLOAD_FAILED");
      const nextUrl = String(data.url ?? "");
      if (!nextUrl) throw new Error("UPLOAD_FAILED");
      setUrl(nextUrl);
      router.refresh();
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setError("Upload zu langsam — bitte kleineres Bild oder erneut versuchen.");
      } else {
        setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
      }
    } finally {
      setUploading(false);
    }
  }

  async function clearLogo() {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("clear", "1");
      body.append("field", field);
      body.append("eventId", eventId);
      const res = await fetch("/api/v1/admin/uploads/ticket-sponsor", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.code ?? "CLEAR_FAILED");
      setUrl("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Entfernen fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--tf-navy)]">{label}</p>
      {hint ? (
        <p className="text-xs text-[var(--tf-text-secondary)]">{hint}</p>
      ) : null}

      {url ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] p-3">
          <div className="flex h-14 w-28 shrink-0 items-center justify-center rounded-xl border border-[var(--tf-line)] bg-white p-1.5">
            <ResponsiveImage
              src={url}
              alt=""
              fit="contain"
              className="!h-full !w-full !rounded-none"
              fallback="event"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--tf-navy)]">
              <Check className="h-4 w-4 text-[var(--tf-teal)]" /> Logo hinterlegt
            </p>
            <div className="mt-1 flex flex-wrap gap-3">
              <button
                type="button"
                className="text-xs font-medium text-[var(--tf-teal)] underline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                Anderes Bild wählen
              </button>
              <button
                type="button"
                className="text-xs font-medium text-[var(--tf-text-secondary)] underline"
                disabled={uploading}
                onClick={() => void clearLogo()}
              >
                Entfernen
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
          }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void uploadFile(file);
          }}
          className={`flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition ${
            dragOver
              ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
              : "border-[var(--tf-line)] bg-[#f8fafc] hover:border-[var(--tf-teal)]"
          }`}
        >
          <Upload className="h-6 w-6 text-[var(--tf-teal)]" strokeWidth={1.75} />
          <p className="text-sm font-semibold text-[var(--tf-navy)]">
            {uploading ? "Wird hochgeladen…" : "Logo hierher ziehen oder klicken"}
          </p>
          <p className="max-w-xs text-xs text-[var(--tf-text-secondary)]">
            Max. {SPONSOR_LOGO_MAX_WIDTH}×{SPONSOR_LOGO_MAX_HEIGHT}px (WebP).
            Seitenverhältnis bleibt erhalten. Max. 8 MB.
          </p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
          e.target.value = "";
        }}
      />
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
