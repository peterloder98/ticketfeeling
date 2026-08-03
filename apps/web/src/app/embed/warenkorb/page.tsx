import { EmbedCartView } from "@/components/embed/embed-cart-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Warenkorb" };

/** Client-loaded so iframe sessionStorage / x-cart-session reaches the API. */
export default function EmbedCartPage() {
  return <EmbedCartView />;
}
