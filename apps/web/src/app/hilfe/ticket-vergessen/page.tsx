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
          Kein Zugriff auf deine Tickets? Wir schicken dir einen sicheren Link — an die
          E-Mail deiner Bestellung.
        </p>
        <p className="mt-3 text-[var(--muted)]">
          Nur die E-Mail reicht uns dafür nicht: Bei der Bestellung hast du auch Name und
          Bestellnummer hinterlassen. Mit einem zweiten Nachweis stellen wir sicher, dass
          niemand fremde Tickets anfordern kann. Am besten E-Mail plus Bestellnummer (steht
          in der Bestätigungsmail) — oder E-Mail plus Nachname, wenn die Nummer weg ist.
        </p>
        <div className="mt-8">
          <ForgottenTicketForm />
        </div>
      </div>
    </div>
  );
}
