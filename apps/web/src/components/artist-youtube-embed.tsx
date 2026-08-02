import { parseYoutubeVideoId, youtubeEmbedUrl } from "@/lib/youtube";

export function ArtistYoutubeEmbed({
  youtube,
  artistName,
  compact = false,
}: {
  youtube: string | null | undefined;
  artistName: string;
  compact?: boolean;
}) {
  const videoId = parseYoutubeVideoId(youtube);
  if (!videoId) return null;

  return (
    <section className={compact ? "" : "tf-card !p-4 sm:!p-5"}>
      {!compact ? (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
            Video
          </p>
          <h2 className="tf-display mt-1 text-xl sm:text-2xl">Jetzt reinhören</h2>
        </div>
      ) : (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--tf-teal)]">
          Video
        </p>
      )}
      <div className="overflow-hidden rounded-xl bg-black shadow-[0_8px_24px_rgba(15,39,71,0.12)]">
        <div className="relative aspect-video w-full">
          <iframe
            src={youtubeEmbedUrl(videoId)}
            title={`${artistName} – Musikvideo`}
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </div>
    </section>
  );
}
