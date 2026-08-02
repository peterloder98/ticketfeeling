import { redirect } from "next/navigation";

type Props = {
  searchParams: Promise<{ day?: string; from?: string; to?: string; eventId?: string }>;
};

/** Legacy URL — Verkauf und Übersicht sind jetzt eine Seite unter /kasse. */
export default async function BoxOfficeSalesRedirectPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.from) params.set("from", sp.from);
  else if (sp.day) params.set("from", sp.day);
  if (sp.to) params.set("to", sp.to);
  else if (sp.day) params.set("to", sp.day);
  if (sp.eventId) params.set("eventId", sp.eventId);
  const qs = params.toString();
  redirect(qs ? `/kasse?${qs}#verkaeufe` : "/kasse#verkaeufe");
}
