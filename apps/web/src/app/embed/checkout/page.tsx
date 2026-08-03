import { EmbedCheckoutView } from "@/components/embed/embed-checkout-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zur Kasse" };

/** Client-loaded so iframe sessionStorage / x-cart-session reaches checkout. */
export default function EmbedCheckoutPage() {
  return <EmbedCheckoutView />;
}
