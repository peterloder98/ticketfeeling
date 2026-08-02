import { channelLabel, isBoxOfficeChannel } from "@/lib/commerce/channels";

export function ChannelBadge({ channel }: { channel: string }) {
  const box = isBoxOfficeChannel(channel);
  return (
    <span
      className={`tf-badge ${box ? "tf-badge-vip" : "tf-badge-teal"}`}
      title={box ? "Verkauf vor Ort an der Tageskasse" : "Online-Selbstkauf durch Kunden"}
    >
      {channelLabel(channel)}
    </span>
  );
}
