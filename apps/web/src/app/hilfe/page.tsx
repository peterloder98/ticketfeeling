import Link from "next/link";
import { ChatWidget } from "@/components/chat-widget";
import { prisma } from "@/lib/db";
import { SupportContactForm } from "@/components/support-contact-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hilfe" };

export default async function HelpPage() {
  const articles = await prisma.supportKnowledgeArticle.findMany({
    where: { status: "published", visibility: "public" },
    orderBy: { title: "asc" },
  });

  return (
    <div className="tf-container py-10 md:py-12">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
          Support
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)] md:text-4xl">
          Hilfe-Chat
        </h1>
        <p className="mt-2 text-[var(--tf-text-secondary)]">
          Unser Chatbot beantwortet Fragen zu Events, Bestellung, Zahlung und Tickets — rund um die
          Uhr. Für Einzelfälle erreichst du unten den Kundenservice.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <ChatWidget />

        <div className="space-y-6">
          <div className="tf-card !p-5">
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Schnellzugriff</h2>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/hilfe/ticket-vergessen" className="tf-btn tf-btn-primary justify-center">
                Ticket vergessen
              </Link>
              <Link href="/events" className="tf-btn tf-btn-secondary justify-center">
                Events ansehen
              </Link>
              <Link href="/konto" className="tf-btn tf-btn-secondary justify-center">
                Meine Tickets / Konto
              </Link>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Häufige Themen</h2>
            {articles.map((article) => (
              <article key={article.id} className="tf-card !p-4">
                <h3 className="font-semibold text-[var(--tf-navy)]">{article.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--tf-text-secondary)]">{article.body}</p>
              </article>
            ))}
          </div>

          <div id="kontakt" className="tf-card !p-5">
            <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Kundenservice</h2>
            <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
              Für individuelle Fälle. Der Bot erstattet oder entwertet keine Tickets.
            </p>
            <div className="mt-4">
              <SupportContactForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
