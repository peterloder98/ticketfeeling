import { createHash } from "crypto";
import { decryptSecret } from "@/lib/crypto-fields";
import { mapToMeta, type TfTrackingEventName } from "@/lib/tracking/events";

export type MetaCapiUserData = {
  email?: string | null;
  phone?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
};

export type MetaCapiEventInput = {
  pixelId: string;
  accessToken: string;
  eventName: TfTrackingEventName;
  eventId: string;
  eventTime?: number;
  eventSourceUrl?: string | null;
  actionSource?: "website" | "system_generated";
  valueCents?: number | null;
  currency?: string | null;
  contentIds?: string[];
  contentName?: string | null;
  numItems?: number | null;
  userData?: MetaCapiUserData;
  testEventCode?: string | null;
};

function sha256Normalize(value: string): string {
  const normalized = value.trim().toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}

function buildUserData(user?: MetaCapiUserData) {
  if (!user) return {};
  const out: Record<string, unknown> = {};
  if (user.email) out.em = [sha256Normalize(user.email)];
  if (user.phone) {
    const digits = user.phone.replace(/\D/g, "");
    if (digits) out.ph = [sha256Normalize(digits)];
  }
  if (user.externalId) out.external_id = [sha256Normalize(user.externalId)];
  if (user.clientIp) out.client_ip_address = user.clientIp;
  if (user.userAgent) out.client_user_agent = user.userAgent.slice(0, 512);
  if (user.fbp) out.fbp = user.fbp;
  if (user.fbc) out.fbc = user.fbc;
  return out;
}

export function resolveMetaCapiAccessToken(encryptedOrgToken?: string | null): string | null {
  const env =
    process.env.META_CAPI_ACCESS_TOKEN?.trim() ||
    process.env.META_ACCESS_TOKEN?.trim() ||
    "";
  if (env) return env;
  if (!encryptedOrgToken) return null;
  try {
    return decryptSecret(encryptedOrgToken);
  } catch {
    return null;
  }
}

/**
 * Send Meta Conversions API event. Returns stub result when token/pixel missing.
 */
export async function sendMetaCapiEvent(input: MetaCapiEventInput): Promise<{
  ok: boolean;
  stub?: boolean;
  status?: number;
  body?: unknown;
  error?: string;
}> {
  const mapped = mapToMeta(input.eventName);
  if (!mapped) {
    return { ok: false, error: "EVENT_NOT_MAPPED_TO_META" };
  }
  if (!input.pixelId || !input.accessToken) {
    return { ok: true, stub: true, body: { reason: "meta_capi_not_configured" } };
  }

  const customData: Record<string, unknown> = {};
  if (input.valueCents != null) {
    customData.value = Math.round(input.valueCents) / 100;
    customData.currency = (input.currency || "EUR").toUpperCase();
  }
  if (input.contentIds?.length) customData.content_ids = input.contentIds;
  if (input.contentName) customData.content_name = input.contentName;
  if (input.numItems != null) customData.num_items = input.numItems;
  customData.content_type = "product";

  const payload = {
    data: [
      {
        event_name: mapped.name,
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        event_source_url: input.eventSourceUrl || undefined,
        action_source: input.actionSource ?? "website",
        user_data: buildUserData(input.userData),
        custom_data: customData,
      },
    ],
    ...(input.testEventCode ? { test_event_code: input.testEventCode } : {}),
  };

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(input.pixelId)}/events?access_token=${encodeURIComponent(input.accessToken)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        body,
        error: typeof body === "object" && body && "error" in body
          ? JSON.stringify((body as { error: unknown }).error).slice(0, 500)
          : `HTTP_${res.status}`,
      };
    }
    return { ok: true, status: res.status, body };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "meta_capi_fetch_failed",
    };
  }
}
