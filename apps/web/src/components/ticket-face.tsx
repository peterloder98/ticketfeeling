import type { TicketFaceEmbed } from "@/lib/commerce/ticket-document";

type Props = {
  /** Canonical face from buildTicketFaceEmbed / loadTicketFaceEmbed */
  face: TicketFaceEmbed;
};

/**
 * Online ticket strip — renders the same HTML used for Print@Home PDF.
 * Do not reintroduce a parallel Tailwind layout here.
 */
export function TicketFace({ face }: Props) {
  return (
    <div className="w-full min-w-0">
      <style dangerouslySetInnerHTML={{ __html: face.css }} />
      <div dangerouslySetInnerHTML={{ __html: face.html }} />
    </div>
  );
}
