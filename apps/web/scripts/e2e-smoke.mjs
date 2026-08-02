import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

function parseSetCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const category = await prisma.eventTicketCategory.findFirst({
    where: { name: "Kategorie 2" },
  });
  if (!category) throw new Error("no category");
  console.log("category", category.id);

  let cookie = "";
  const addRes = await fetch(`${BASE}/api/v1/cart/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ categoryId: category.id, quantity: 2 }),
  });
  cookie = parseSetCookie(addRes) || cookie;
  console.log("cart", addRes.status, await addRes.json());

  const checkoutRes = await fetch(`${BASE}/api/v1/checkout/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      email: "kunde@example.com",
      password: "KundenPasswort!26",
      firstName: "Clara",
      lastName: "Kauf",
      gender: "female",
      street: "Testweg",
      houseNumber: "7",
      postalCode: "80331",
      city: "München",
      acceptTerms: true,
      acknowledgePrivacy: true,
      acknowledgeNoWithdrawal: true,
    }),
  });
  const checkout = await checkoutRes.json();
  console.log("checkout", checkoutRes.status, checkout);
  if (!checkout.orderId) throw new Error("checkout failed");

  const eventIdDup = `evt_dup_${checkout.orderId}`;
  const payRes = await fetch(`${BASE}/api/v1/payments/webhooks/dev`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerEventId: eventIdDup,
      providerPaymentId: checkout.providerPaymentId,
      secret: "dev-webhook-secret",
    }),
  });
  console.log("pay", payRes.status, await payRes.json());

  const dupRes = await fetch(`${BASE}/api/v1/payments/webhooks/dev`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerEventId: eventIdDup,
      providerPaymentId: checkout.providerPaymentId,
      secret: "dev-webhook-secret",
    }),
  });
  console.log("dup", await dupRes.json());

  const ticket = await prisma.ticket.findFirst({
    where: { orderId: checkout.orderId },
    include: { qrTokens: true },
  });
  if (!ticket?.qrTokens[0]) throw new Error("no ticket token");
  console.log("ticket", ticket.ticketNumber);

  const scans = [];
  for (const action of ["in", "in", "out", "in"]) {
    const scan = await fetch(`${BASE}/api/v1/scanner/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: ticket.eventId,
        token: ticket.qrTokens[0].token,
        action,
      }),
    }).then((r) => r.json());
    scans.push(scan.color);
  }
  console.log("scans", scans.join(","));

  for (const path of [
    "/event/schlagerfeeling-weihnachtstraum-2026",
    "/warenkorb",
    "/checkout",
  ]) {
    const r = await fetch(`${BASE}${path}`);
    console.log(path, r.status);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
