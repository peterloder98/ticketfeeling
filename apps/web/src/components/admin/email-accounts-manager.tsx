"use client";

import { useActionState, useState } from "react";
import {
  createEmailAccountAction,
  deleteEmailAccountAction,
  setDefaultEmailAccountAction,
  testEmailAccountAction,
  updateEmailAccountAction,
  type SmtpTestState,
} from "@/app/admin/einstellungen/email/actions";

export type EmailAccountRow = {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
  isDefault: boolean;
  passwordSet: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
};

const testInitial: SmtpTestState = { ok: null, message: "" };

function TestResult({ state }: { state: SmtpTestState }) {
  if (!state.message) return null;
  return (
    <p
      className={`rounded-xl px-3 py-2 text-sm ${
        state.ok
          ? "bg-[rgba(34,197,94,0.12)] text-[#15803d]"
          : "bg-[rgba(239,68,68,0.1)] text-[#b91c1c]"
      }`}
      role="status"
    >
      {state.message}
    </p>
  );
}

function AccountTestForm({ accountId }: { accountId: string }) {
  const [state, action, pending] = useActionState(testEmailAccountAction, testInitial);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--tf-line)] pt-3">
      <form action={action}>
        <input type="hidden" name="id" value={accountId} />
        <button type="submit" className="tf-btn tf-btn-secondary !min-h-10 text-sm" disabled={pending}>
          {pending ? "Prüfe…" : "Daten prüfen"}
        </button>
      </form>
      <TestResult state={state} />
    </div>
  );
}

function AccountEditor({
  account,
  onClose,
}: {
  account: EmailAccountRow;
  onClose: () => void;
}) {
  const [testState, testAction, testing] = useActionState(testEmailAccountAction, testInitial);

  return (
    <form
      action={async (fd) => {
        await updateEmailAccountAction(fd);
        onClose();
      }}
      className="mt-3 grid gap-3 rounded-xl bg-[rgba(15,39,71,0.03)] p-4"
    >
      <input type="hidden" name="id" value={account.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Bezeichnung</span>
          <input name="label" className="tf-input" required defaultValue={account.label} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>From-E-Mail</span>
          <input
            name="fromEmail"
            type="email"
            className="tf-input"
            required
            defaultValue={account.fromEmail}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>From-Name</span>
          <input name="fromName" className="tf-input" defaultValue={account.fromName ?? ""} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Host</span>
          <input name="host" className="tf-input" required defaultValue={account.host} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Port</span>
          <input name="port" type="number" className="tf-input" defaultValue={account.port} />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Benutzer (volle E-Mail)</span>
          <input name="username" className="tf-input" required defaultValue={account.username} />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span>Passwort {account.passwordSet ? "(leer = gespeichertes nutzen)" : ""}</span>
          <input
            name="password"
            type="password"
            className="tf-input"
            autoComplete="new-password"
            placeholder={account.passwordSet ? "••••••••" : ""}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="secure" defaultChecked={account.secure} />
        <span>Secure / SSL (bei Port 465 automatisch)</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" defaultChecked={account.isDefault} />
        <span>Als Standard setzen</span>
      </label>

      <TestResult state={testState} />

      <div className="flex flex-wrap gap-2 border-t border-[var(--tf-line)] pt-3">
        <button
          type="submit"
          formAction={testAction}
          className="tf-btn tf-btn-secondary"
          disabled={testing}
        >
          {testing ? "Prüfe…" : "Daten prüfen"}
        </button>
        <button type="submit" className="tf-btn tf-btn-primary">
          Speichern
        </button>
        <button type="button" className="tf-btn tf-btn-secondary" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

function NewAccountForm({ onDone }: { onDone: () => void }) {
  const [testState, testAction, testing] = useActionState(testEmailAccountAction, testInitial);

  return (
    <div className="tf-card space-y-4">
      <h3 className="font-semibold text-[var(--tf-navy)]">Neues E-Mail-Konto</h3>
      <form
        action={async (fd) => {
          await createEmailAccountAction(fd);
          onDone();
        }}
        className="grid gap-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span>Bezeichnung</span>
            <input name="label" className="tf-input" placeholder="Tickets Versand" required />
          </label>
          <label className="grid gap-1 text-sm">
            <span>From-E-Mail</span>
            <input name="fromEmail" type="email" className="tf-input" required />
          </label>
          <label className="grid gap-1 text-sm">
            <span>From-Name</span>
            <input name="fromName" className="tf-input" placeholder="Ticketfeeling" />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Host</span>
            <input
              name="host"
              className="tf-input"
              placeholder="smtp.hostinger.com"
              defaultValue="smtp.hostinger.com"
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Port</span>
            <input name="port" type="number" className="tf-input" defaultValue={465} />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Benutzer (volle E-Mail)</span>
            <input name="username" className="tf-input" required />
          </label>
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span>Passwort</span>
            <input
              name="password"
              type="password"
              className="tf-input"
              required
              autoComplete="new-password"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="secure" defaultChecked />
          <span>Secure / SSL (bei Port 465 automatisch)</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDefault" defaultChecked />
          <span>Als Standard setzen</span>
        </label>

        <TestResult state={testState} />

        <div className="flex flex-wrap gap-2 border-t border-[var(--tf-line)] pt-3">
          <button
            type="submit"
            formAction={testAction}
            className="tf-btn tf-btn-secondary"
            disabled={testing}
          >
            {testing ? "Prüfe…" : "Daten prüfen"}
          </button>
          <button type="submit" className="tf-btn tf-btn-primary">
            Speichern
          </button>
          <button type="button" className="tf-btn tf-btn-secondary" onClick={onDone}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

export function EmailAccountsManager({ accounts }: { accounts: EmailAccountRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(accounts.length === 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--tf-text-secondary)]">
          Mehrere Versandkonten möglich. Transaktionsmails nutzen das{" "}
          <strong>Standard</strong>-Konto.
        </p>
        {!showNew ? (
          <button type="button" className="tf-btn tf-btn-primary" onClick={() => setShowNew(true)}>
            Neues Konto
          </button>
        ) : null}
      </div>

      {showNew ? <NewAccountForm onDone={() => setShowNew(false)} /> : null}

      {accounts.map((account) => (
        <div key={account.id} className="tf-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-[var(--tf-navy)]">{account.label}</h3>
                {account.isDefault ? (
                  <span className="rounded-full bg-[rgba(20,184,166,0.15)] px-2.5 py-0.5 text-xs font-semibold text-[var(--tf-teal-hover)]">
                    Standard
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
                {account.fromName ? `${account.fromName} · ` : ""}
                {account.fromEmail}
              </p>
              <p className="mt-0.5 text-sm text-[var(--tf-text-secondary)]">
                {account.host}:{account.port}
                {account.secure ? " · SSL/TLS" : ""} · {account.username}
              </p>
              {account.lastTestedAt ? (
                <p
                  className={`mt-2 text-xs ${
                    account.lastTestOk ? "text-[#15803d]" : "text-[#b91c1c]"
                  }`}
                >
                  Letzte Prüfung{" "}
                  {new Date(account.lastTestedAt).toLocaleString("de-DE", {
                    timeZone: "Europe/Berlin",
                  })}
                  : {account.lastTestMessage}
                </p>
              ) : (
                <p className="mt-2 text-xs text-[var(--tf-text-secondary)]">Noch nicht geprüft</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!account.isDefault ? (
                <form action={setDefaultEmailAccountAction}>
                  <input type="hidden" name="id" value={account.id} />
                  <button type="submit" className="tf-btn tf-btn-secondary !min-h-10 text-sm">
                    Als Standard
                  </button>
                </form>
              ) : null}
              <button
                type="button"
                className="tf-btn tf-btn-secondary !min-h-10 text-sm"
                onClick={() => setEditingId(editingId === account.id ? null : account.id)}
              >
                Bearbeiten
              </button>
              <form
                action={deleteEmailAccountAction}
                onSubmit={(e) => {
                  if (!confirm(`Konto „${account.label}“ wirklich löschen?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="id" value={account.id} />
                <button type="submit" className="tf-btn tf-btn-danger !min-h-10 text-sm">
                  Löschen
                </button>
              </form>
            </div>
          </div>

          {editingId === account.id ? (
            <AccountEditor account={account} onClose={() => setEditingId(null)} />
          ) : (
            <AccountTestForm accountId={account.id} />
          )}
        </div>
      ))}

      {accounts.length === 0 && !showNew ? (
        <p className="text-sm text-[var(--tf-text-secondary)]">Noch keine E-Mail-Konten.</p>
      ) : null}
    </div>
  );
}
