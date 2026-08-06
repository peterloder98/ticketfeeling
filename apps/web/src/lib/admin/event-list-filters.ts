export const EVENT_LIST_FILTERS = [
  {
    key: "onsale",
    label: "Im Verkauf",
    statuses: ["presale_active", "published", "sold_out"],
  },
  {
    key: "scheduled",
    label: "Verkauf geplant",
    statuses: ["announcement"],
  },
  {
    key: "paused",
    label: "Pausiert",
    statuses: ["paused"],
  },
  {
    key: "draft",
    label: "Entwurf",
    statuses: ["draft"],
  },
  {
    key: "cancelled",
    label: "Abgesagt",
    statuses: ["cancelled", "completed"],
  },
] as const;

export type EventListFilterKey = (typeof EVENT_LIST_FILTERS)[number]["key"];

/** Default: nur Im Verkauf — geplante, pausierte, Entwurf und Abgesagt über die Filter. */
export const DEFAULT_EVENT_LIST_FILTERS: EventListFilterKey[] = ["onsale"];

export function parseEventListFilters(raw: string | undefined | null): EventListFilterKey[] {
  if (!raw?.trim()) return [...DEFAULT_EVENT_LIST_FILTERS];
  const allowed = new Set(EVENT_LIST_FILTERS.map((f) => f.key));
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is EventListFilterKey => allowed.has(s as EventListFilterKey));
  return parsed.length > 0 ? parsed : [...DEFAULT_EVENT_LIST_FILTERS];
}

export function statusesForEventListFilters(keys: EventListFilterKey[]): string[] {
  const statuses = new Set<string>();
  for (const key of keys) {
    const filter = EVENT_LIST_FILTERS.find((f) => f.key === key);
    if (!filter) continue;
    for (const status of filter.statuses) statuses.add(status);
  }
  return [...statuses];
}

export function isDefaultEventListFilters(keys: EventListFilterKey[]): boolean {
  if (keys.length !== DEFAULT_EVENT_LIST_FILTERS.length) return false;
  return DEFAULT_EVENT_LIST_FILTERS.every((k) => keys.includes(k));
}

/** Toggle one chip; keeps at least one filter active. */
export function toggleEventListFilter(
  active: EventListFilterKey[],
  key: EventListFilterKey,
): EventListFilterKey[] {
  const set = new Set(active);
  if (set.has(key)) {
    if (set.size === 1) return active;
    set.delete(key);
  } else {
    set.add(key);
  }
  return EVENT_LIST_FILTERS.map((f) => f.key).filter((k) => set.has(k));
}

export function eventListFilterHref(keys: EventListFilterKey[]): string {
  if (isDefaultEventListFilters(keys)) return "/admin/events";
  return `/admin/events?f=${keys.join(",")}`;
}

/** Persist chip selection so delete/cancel return keeps the filtered list. */
export const EVENT_LIST_FILTER_STORAGE_KEY = "tf-admin-event-list-filters";

export function rememberEventListFilters(keys: EventListFilterKey[]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(EVENT_LIST_FILTER_STORAGE_KEY, keys.join(","));
  } catch {
    /* private mode / quota */
  }
}

export function recalledEventListHref(): string {
  if (typeof window === "undefined") return "/admin/events";
  try {
    const raw = sessionStorage.getItem(EVENT_LIST_FILTER_STORAGE_KEY);
    return eventListFilterHref(parseEventListFilters(raw));
  } catch {
    return "/admin/events";
  }
}
