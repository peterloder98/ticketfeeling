import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { prisma } from "@/lib/db";
import { SupportContactForm } from "@/components/support-contact-form";
import { OpenChatButton } from "@/components/open-chat-button";
import { SUPPORT_KNOWLEDGE_HILFE_ORDER } from "@/lib/support/knowledge-articles";
import { ensureSupportKnowledge } from "@/lib/support/sync-knowledge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hilfe" };

export default async function HelpPage() {
  const org = await prisma.organization.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (org) {
    await ensureSupportKnowledge(org.id);
  }

  const articlesRaw = await prisma.supportKnowledgeArticle.findMany({
    where: {
      status: "published",
      visibility: "public",
      ...(org ? { organizationId: org.id } : {}),
    },
  });
  const orderIndex = new Map(SUPPORT_KNOWLEDGE_HILFE_ORDER.map((slug, i) => [slug, i]));
  const articles = [...articlesRaw].sort((a, b) => {
    const ai = orderIndex.get(a.slug) ?? 1000;
    const bi = orderIndex.get(b.slug) ?? 1000;
    if (ai !== bi) return ai - bi;
    return a.title.localeCompare(b.title, "de");
  });

  return (
    <div className="tf-container py-10 md:py-12">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
          Support
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--tf-navy)] md:text-4xl">
          Hilfe
        </h1>
        <p className="mt-2 text-[var(--tf-text-secondary)]">
          Schnelle Antworten im Chat, klare Themen unten — und für Einzelfälle den Kundenservice.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="tf-card !p-5">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Chat-Assistent</h2>
          <p className="mt-1.5 text-sm text-[var(--tf-text-secondary)]">
            Fragen zu Events, Bestellung, Zahlung und Tickets — rund um die Uhr. Öffnet den Chat
            unten rechts.
          </p>
          <div className="mt-4">
            <OpenChatButton />
          </div>
        </div>

        <div className="tf-card !p-5">
          <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Schnellzugriff</h2>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/hilfe/ticket-vergessen" className="tf-btn tf-btn-primary justify-center">
              Ticket vergessen
            </Link>
            <a href="#kontakt" className="tf-btn tf-btn-secondary justify-center">
              Kundenservice schreiben
            </a>
            <Link href="/events" className="tf-btn tf-btn-secondary justify-center">
              Events ansehen
            </Link>
            <Link href="/konto" className="tf-btn tf-btn-secondary justify-center">
              Meine Tickets / Konto
            </Link>
          </div>
        </div>
      </div>

      <div id="kontakt" className="tf-card mt-8 scroll-mt-28 !p-5 md:scroll-mt-24">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Kundenservice</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Für individuelle Fälle. Der Chat erstattet oder entwertet keine Tickets.
        </p>
        <div className="mt-4">
          <SupportContactForm />
        </div>
      </div>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-semibold text-[var(--tf-navy)]">Häufige Themen</h2>
        <p className="mt-1 text-sm text-[var(--tf-text-secondary)]">
          Tippe auf ein Thema — die Antwort klappt auf.
        </p>
        {articles.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--tf-text-secondary)]">
            Gerade keine veröffentlichten Artikel.
          </p>
        ) : (
          <div className="tf-card mt-4 divide-y divide-[var(--tf-line)] !p-0 overflow-hidden">
            {articles.map((article) => (
              <details key={article.id} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition hover:bg-[rgba(20,184,166,0.04)] [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 font-medium text-[var(--tf-navy)]">
                    {article.title}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-[var(--tf-text-secondary)] transition group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="px-4 pb-4 text-sm leading-relaxed whitespace-pre-wrap text-[var(--tf-text-secondary)]">
                  {article.body}
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
