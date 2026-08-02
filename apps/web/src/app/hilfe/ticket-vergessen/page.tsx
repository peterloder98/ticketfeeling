import { ForgottenTicketForm } from "@/components/forgotten-ticket-form";

export const metadata = { title: "Ticket vergessen" };

export default function ForgottenTicketPage() {
  return (
    <div className="tf-container py-12">
      <div className="mx-auto max-w-xl">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--gold-soft)]">
          Ticket vergessen
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Kein Zugriff auf deine Tickets? Fordere einen sicheren Link an. Wir verraten aus
          Datenschutzgründen nicht, ob eine E-Mail bei uns bekannt ist.
        </p>
        <div className="mt-8">
          <ForgottenTicketForm />
        </div>
      </div>
    </div>
  );
}
