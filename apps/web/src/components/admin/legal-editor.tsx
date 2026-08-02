"use client";

import { useMemo, useState, useTransition } from "react";
import {
  publishLegalVersionAction,
  saveLegalDraftAction,
} from "@/app/admin/einstellungen/recht/actions";

type VersionRow = {
  id: string;
  version: string;
  title: string;
  content: string;
  changelog: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
};

export function LegalEditor({
  type,
  label,
  initialVersions,
  canWrite,
}: {
  type: string;
  label: string;
  initialVersions: VersionRow[];
  canWrite: boolean;
}) {
  const published = initialVersions.find((v) => v.status === "published");
  const draft = initialVersions.find((v) => v.status === "draft");
  const base = draft ?? published ?? initialVersions[0];

  const [version, setVersion] = useState(draft?.version ?? bumpPatch(published?.version ?? "1.0.0"));
  const [title, setTitle] = useState(base?.title ?? label);
  const [content, setContent] = useState(base?.content ?? "");
  const [changelog, setChangelog] = useState(base?.changelog ?? "");
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const history = useMemo(
    () =>
      [...initialVersions].sort((a, b) => {
        const ta = a.publishedAt ?? a.createdAt;
        const tb = b.publishedAt ?? b.createdAt;
        return tb.localeCompare(ta);
      }),
    [initialVersions],
  );

  function run(action: (fd: FormData) => Promise<void>, ok: string) {
    const fd = new FormData();
    fd.set("type", type);
    fd.set("version", version);
    fd.set("title", title);
    fd.set("content", content);
    fd.set("changelog", changelog);
    startTransition(async () => {
      try {
        await action(fd);
        setMessage(ok);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-[var(--tf-navy)]">{label}</h2>
        <button
          type="button"
          className="text-sm font-medium text-[var(--tf-teal)] underline"
          onClick={() => setPreview((p) => !p)}
        >
          {preview ? "Editor" : "Vorschau"}
        </button>
      </div>

      {preview ? (
        <div className="tf-card whitespace-pre-wrap text-sm leading-relaxed text-[var(--tf-text-secondary)]">
          <h3 className="mb-3 text-lg font-semibold text-[var(--tf-navy)]">{title}</h3>
          {content}
        </div>
      ) : (
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Version</span>
            <input
              className="tf-input"
              value={version}
              disabled={!canWrite}
              onChange={(e) => setVersion(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Titel</span>
            <input
              className="tf-input"
              value={title}
              disabled={!canWrite}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Änderungsprotokoll</span>
            <input
              className="tf-input"
              value={changelog}
              disabled={!canWrite}
              onChange={(e) => setChangelog(e.target.value)}
              placeholder="Was wurde geändert?"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-[var(--tf-navy)]">Inhalt</span>
            <textarea
              className="tf-input min-h-[28rem] font-mono text-xs leading-relaxed"
              value={content}
              disabled={!canWrite}
              onChange={(e) => setContent(e.target.value)}
            />
          </label>
        </div>
      )}

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="tf-btn tf-btn-secondary"
            disabled={pending}
            onClick={() => run(saveLegalDraftAction, "Entwurf gespeichert.")}
          >
            Als Entwurf speichern
          </button>
          <button
            type="button"
            className="tf-btn tf-btn-primary"
            disabled={pending}
            onClick={() => run(publishLegalVersionAction, "Veröffentlicht.")}
          >
            Veröffentlichen
          </button>
        </div>
      ) : null}
      {message ? <p className="text-sm text-[var(--tf-teal)]">{message}</p> : null}

      <div>
        <h3 className="text-sm font-semibold text-[var(--tf-navy)]">Versionen / Archiv</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {history.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--tf-line)] px-3 py-2"
            >
              <span>
                v{v.version} · {v.status}
                {v.changelog ? ` · ${v.changelog}` : ""}
              </span>
              <button
                type="button"
                className="text-xs font-medium text-[var(--tf-teal)] underline"
                onClick={() => {
                  setVersion(v.version);
                  setTitle(v.title);
                  setContent(v.content);
                  setChangelog(v.changelog ?? "");
                  setPreview(false);
                }}
              >
                Laden
              </button>
            </li>
          ))}
          {history.length === 0 ? (
            <li className="text-[var(--tf-text-secondary)]">Noch keine Versionen.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function bumpPatch(version: string) {
  const parts = version.split(".").map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return "1.0.1";
  return `${parts[0]}.${parts[1]}.${parts[2]! + 1}`;
}
