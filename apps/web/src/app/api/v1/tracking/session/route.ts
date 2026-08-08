import { NextResponse } from "next/server";
import { z } from "zod";
import { getDefaultOrganization } from "@/lib/commerce/org";
import { parseAttributionFromUnknown } from "@/lib/tracking/attribution";
import { upsertTrackingSession } from "@/lib/tracking/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  clientSessionId: z.string().uuid(),
  visitorId: z.string().max(64).optional().nullable(),
  embedMode: z.boolean().optional(),
  attribution: z.record(z.unknown()).optional(),
  consent: z
    .object({
      statistics: z.boolean(),
      marketing: z.boolean(),
    })
    .optional(),
  gaClientId: z.string().max(128).optional().nullable(),
  gaSessionId: z.string().max(128).optional().nullable(),
  fbp: z.string().max(256).optional().nullable(),
  fbc: z.string().max(512).optional().nullable(),
});

/** Upsert TF tracking session with parent attribution (embed) or direct UTMs. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }

  const org = await getDefaultOrganization();
  if (!org) {
    return NextResponse.json({ error: "org_missing" }, { status: 503 });
  }

  const session = await upsertTrackingSession({
    organizationId: org.id,
    clientSessionId: parsed.data.clientSessionId,
    visitorId: parsed.data.visitorId,
    embedMode: parsed.data.embedMode,
    attribution: parseAttributionFromUnknown(parsed.data.attribution ?? {}),
    gaClientId: parsed.data.gaClientId,
    gaSessionId: parsed.data.gaSessionId,
    fbp: parsed.data.fbp,
    fbc: parsed.data.fbc,
    consentStatistics: parsed.data.consent?.statistics,
    consentMarketing: parsed.data.consent?.marketing,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({
    ok: true,
    trackingSessionId: session.id,
    clientSessionId: session.clientSessionId,
  });
}
