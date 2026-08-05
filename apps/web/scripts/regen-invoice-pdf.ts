import { writeFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { getOrCreateInvoicePdf } from "../src/lib/commerce/invoice-pdf";

async function main() {
  const inv =
    (await prisma.invoice.findFirst({
      where: { invoiceNumber: "TF-R-2026-000003" },
      select: { id: true, invoiceNumber: true },
    })) ??
    (await prisma.invoice.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, invoiceNumber: true },
    }));

  if (!inv) {
    console.error("No invoice found in DB");
    process.exit(1);
  }

  const orderItems = await prisma.orderItem.findMany({
    where: { order: { invoices: { some: { id: inv.id } } } },
    select: {
      eventNameSnapshot: true,
      categorySnapshot: true,
      eventStartsAtSnapshot: true,
      locationSnapshot: true,
    },
  });
  console.log("Invoice", inv.invoiceNumber, inv.id);
  console.log("Order items:", JSON.stringify(orderItems, null, 2));

  const pdf = await getOrCreateInvoicePdf(inv.id);
  const out = `/tmp/${pdf.filename}`;
  writeFileSync(out, pdf.buffer);
  writeFileSync(`/Users/peterloder/Downloads/${pdf.filename.replace(".pdf", "-fixed.pdf")}`, pdf.buffer);
  console.log("Wrote", out, "bytes", pdf.buffer.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
