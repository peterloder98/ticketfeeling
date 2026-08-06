"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check } from "lucide-react";
import { ResponsiveImage } from "@/components/responsive-image";

type Props = {
  kind: "profile" | "header";
  /** Hidden form field — omit when wiring via onUrlChange (e.g. lineup JSON). */
  name?: string;
  label: string;
  artistId?: string;
  initialUrl?: string | null;
  hint?: string;
  /** Controlled URL updates (wizard / lineup editor). */
  onUrlChange?: (url: string) => void;
};

const KIND_HINT: Record<Props["kind"], string> = {
  profile: "Wird auf ca. 1000 px Kante optimiert (WebP).",
  header: "Wird auf ca. 1800 px Kante optimiert (WebP).",
};

export function ArtistImageField({
  kind,
  name,
  label,
  artistId,
  initialUrl,
  hint,
  onUrlChange,
}: Props) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showUrl, setShowUrl] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(initialUrl ?? "");
  }, [initialUrl]);

  function commitUrl(next: string) {
    setUrl(next);
    onUrlChange?.(next);
  }

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Bitte eine Bilddatei wählen (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("Maximal 12 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", kind);
      if (artistId) body.append("artistId", artistId);

      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 45_000);
      let res: Response;
      try {
        res = await fetch("/api/v1/admin/uploads/artist", {
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
      commitUrl(nextUrl);
      if (artistId) router.refresh();
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

  async function clearImage() {
    setError(null);
    if (artistId) {
      setUploading(true);
      try {
        const body = new FormData();
        body.append("clear", "1");
        body.append("kind", kind);
        body.append("artistId", artistId);
        const res = await fetch("/api/v1/admin/uploads/artist", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.code ?? "CLEAR_FAILED");
        commitUrl("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Entfernen fehlgeschlagen");
      } finally {
        setUploading(false);
      }
      return;
    }
    commitUrl("");
  }

  return (
    <div className="space-y-2">
      {name ? <input type="hidden" name={name} value={url} /> : null}
      <p className="text-sm font-medium text-[var(--tf-navy)]">{label}</p>
      <p className="text-xs text-[var(--tf-text-secondary)]">{hint ?? KIND_HINT[kind]}</p>

      {url && !uploading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(20,184,166,0.35)] bg-[rgba(20,184,166,0.08)] p-3">
          <ResponsiveImage
            src={url}
            alt=""
            className={
              kind === "header"
                ? "h-14 w-28 shrink-0 rounded-xl"
                : "h-16 w-16 shrink-0 rounded-xl"
            }
            fallback="person"
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--tf-navy)]">
              <Check className="h-4 w-4 text-[var(--tf-teal)]" /> Bild gesetzt
            </p>
            <div className="mt-1 flex flex-wrap gap-3">
              <button
                type="button"
                className="text-xs font-medium text-[var(--tf-teal)] underline"
                onClick={() => fileRef.current?.click()}
              >
                Anderes Bild wählen
              </button>
              <button
                type="button"
                className="text-xs font-medium text-[var(--tf-text-secondary)] underline"
                disabled={uploading}
                onClick={() => void clearImage()}
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
          className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragOver
              ? "border-[var(--tf-teal)] bg-[rgba(20,184,166,0.08)]"
              : "border-[var(--tf-line)] bg-[#f8fafc] hover:border-[var(--tf-teal)]"
          }`}
        >
          <Upload className="h-7 w-7 text-[var(--tf-teal)]" strokeWidth={1.75} />
          <p className="text-sm font-semibold text-[var(--tf-navy)]">
            {uploading ? "Wird hochgeladen…" : "Bild hierher ziehen oder klicken"}
          </p>
          <p className="max-w-xs text-xs text-[var(--tf-text-secondary)]">Max. 12 MB · JPG, PNG, WebP</p>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
          e.target.value = "";
        }}
      />

      <button
        type="button"
        className="text-xs font-medium text-[var(--tf-text-secondary)] underline"
        onClick={() => setShowUrl((v) => !v)}
      >
        {showUrl ? "URL-Feld ausblenden" : "Stattdessen URL einfügen"}
      </button>
      {showUrl ? (
        <label className="grid gap-1 text-sm">
          <span className="text-[var(--tf-text-secondary)]">Bild-URL</span>
          <input
            className="tf-input"
            value={url}
            onChange={(e) => commitUrl(e.target.value.trim())}
            placeholder="https://… oder /api/assets/…"
            inputMode="url"
          />
        </label>
      ) : null}

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
