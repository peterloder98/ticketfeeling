import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type JobErrorKind = "TEMP" | "PERMANENT";

export type JobStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "dead_letter"
  | "needs_attention";

export type JobType =
  | "order.post_fulfill"
  | "order.send_ticket_email"
  | "order.accounting_stub"
  | "email.send"
  | "reconcile.heal_order";

const PERMANENT_MARKERS = [
  "PERMANENT",
  "VALIDATION",
  "NOT_FOUND",
  "ORDER_NOT_FOUND",
  "PAYMENT_NOT_PAID",
  "PAYMENT_AMOUNT_MISMATCH",
  "PAYMENT_EARLY_RELEASE_FORBIDDEN",
  "AMBIGUOUS",
];

export function classifyJobError(error: unknown): JobErrorKind {
  const message = error instanceof Error ? error.message : String(error ?? "error");
  const upper = message.toUpperCase();
  if (PERMANENT_MARKERS.some((m) => upper.includes(m))) return "PERMANENT";
  // SMTP auth / bad recipient often permanent
  if (/invalid login|authentication failed|550 |551 |553 /i.test(message)) {
    return "PERMANENT";
  }
  return "TEMP";
}

/** Exponential backoff with jitter: ~15s, 45s, 2m, 6m, 18m, 54m, 2h, 6h */
export function backoffMs(attemptCount: number): number {
  const base = 15_000;
  const exp = Math.min(attemptCount, 8);
  const ms = base * Math.pow(3, Math.max(0, exp - 1));
  const jitter = Math.floor(Math.random() * 2_000);
  return Math.min(ms + jitter, 6 * 60 * 60 * 1000);
}

export class JobPermanentError extends Error {
  readonly kind: JobErrorKind = "PERMANENT";
  constructor(message: string) {
    super(message);
    this.name = "JobPermanentError";
  }
}

export class JobNeedsAttentionError extends Error {
  readonly kind: JobErrorKind = "PERMANENT";
  readonly needsAttention = true;
  constructor(message: string) {
    super(`NEEDS_ATTENTION: ${message}`);
    this.name = "JobNeedsAttentionError";
  }
}

export async function enqueueJob(input: {
  type: JobType | string;
  payload: Record<string, unknown>;
  organizationId?: string | null;
  dedupeKey?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
}): Promise<{ id: string; created: boolean }> {
  if (input.dedupeKey) {
    const existing = await prisma.backgroundJob.findUnique({
      where: { dedupeKey: input.dedupeKey },
      select: { id: true, status: true },
    });
    if (existing) {
      // Re-queue dead/failed/needs_attention for another try when explicitly enqueued again
      if (
        existing.status === "dead_letter" ||
        existing.status === "failed" ||
        existing.status === "needs_attention" ||
        existing.status === "succeeded"
      ) {
        // For succeeded with same dedupe — leave alone (idempotent)
        if (existing.status === "succeeded") {
          return { id: existing.id, created: false };
        }
        await prisma.backgroundJob.update({
          where: { id: existing.id },
          data: {
            status: "pending",
            runAfter: input.runAfter ?? new Date(),
            lastError: null,
            lastErrorKind: null,
            lockedAt: null,
            completedAt: null,
            payload: input.payload as Prisma.InputJsonValue,
          },
        });
        return { id: existing.id, created: false };
      }
      return { id: existing.id, created: false };
    }
  }

  try {
    const row = await prisma.backgroundJob.create({
      data: {
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        organizationId: input.organizationId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        runAfter: input.runAfter ?? new Date(),
        maxAttempts: input.maxAttempts ?? 8,
        status: "pending",
      },
      select: { id: true },
    });
    return { id: row.id, created: true };
  } catch (error) {
    // Unique race on dedupeKey
    if (
      input.dedupeKey &&
      typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const existing = await prisma.backgroundJob.findUnique({
        where: { dedupeKey: input.dedupeKey },
        select: { id: true },
      });
      if (existing) return { id: existing.id, created: false };
    }
    throw error;
  }
}

type JobHandler = (payload: Record<string, unknown>, job: { id: string; type: string }) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export function getJobHandler(type: string) {
  return handlers.get(type);
}

async function claimNextJobs(limit: number) {
  const now = new Date();
  // Stale lock recovery (> 5 min)
  await prisma.backgroundJob.updateMany({
    where: {
      status: "processing",
      lockedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
    },
    data: { status: "pending", lockedAt: null },
  });

  const candidates = await prisma.backgroundJob.findMany({
    where: {
      status: "pending",
      runAfter: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: limit * 3,
    select: { id: true },
  });

  const claimed: string[] = [];
  for (const c of candidates) {
    if (claimed.length >= limit) break;
    const updated = await prisma.backgroundJob.updateMany({
      where: { id: c.id, status: "pending" },
      data: {
        status: "processing",
        lockedAt: now,
        attemptCount: { increment: 1 },
      },
    });
    if (updated.count === 1) claimed.push(c.id);
  }
  return claimed;
}

export async function processJobById(jobId: string): Promise<{
  ok: boolean;
  status: JobStatus;
  error?: string;
}> {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, status: "failed", error: "NOT_FOUND" };

  if (job.status !== "processing" && job.status !== "pending") {
    return { ok: job.status === "succeeded", status: job.status as JobStatus };
  }

  if (job.status === "pending") {
    await prisma.backgroundJob.updateMany({
      where: { id: jobId, status: "pending" },
      data: {
        status: "processing",
        lockedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });
  }

  const fresh = await prisma.backgroundJob.findUnique({ where: { id: jobId } });
  if (!fresh || fresh.status !== "processing") {
    return { ok: false, status: (fresh?.status as JobStatus) ?? "failed" };
  }

  const handler = handlers.get(fresh.type);
  if (!handler) {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "dead_letter",
        lastErrorKind: "PERMANENT",
        lastError: `NO_HANDLER:${fresh.type}`,
        completedAt: new Date(),
        lockedAt: null,
      },
    });
    return { ok: false, status: "dead_letter", error: `NO_HANDLER:${fresh.type}` };
  }

  try {
    const payload =
      typeof fresh.payload === "object" && fresh.payload && !Array.isArray(fresh.payload)
        ? (fresh.payload as Record<string, unknown>)
        : {};
    await handler(payload, { id: fresh.id, type: fresh.type });
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "succeeded",
        completedAt: new Date(),
        lockedAt: null,
        lastError: null,
        lastErrorKind: null,
      },
    });
    return { ok: true, status: "succeeded" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const needsAttention =
      error instanceof JobNeedsAttentionError || message.startsWith("NEEDS_ATTENTION:");
    const kind =
      error instanceof JobPermanentError || error instanceof JobNeedsAttentionError
        ? "PERMANENT"
        : classifyJobError(error);

    if (needsAttention) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "needs_attention",
          lastErrorKind: kind,
          lastError: message.slice(0, 4000),
          completedAt: new Date(),
          lockedAt: null,
        },
      });
      return { ok: false, status: "needs_attention", error: message };
    }

    const attempts = fresh.attemptCount;
    const exhausted = kind === "PERMANENT" || attempts >= fresh.maxAttempts;
    if (exhausted) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "dead_letter",
          lastErrorKind: kind,
          lastError: message.slice(0, 4000),
          completedAt: new Date(),
          lockedAt: null,
        },
      });
      return { ok: false, status: "dead_letter", error: message };
    }

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "pending",
        lastErrorKind: kind,
        lastError: message.slice(0, 4000),
        runAfter: new Date(Date.now() + backoffMs(attempts)),
        lockedAt: null,
      },
    });
    return { ok: false, status: "failed", error: message };
  }
}

export async function processPendingJobs(options?: {
  limit?: number;
}): Promise<{ claimed: number; succeeded: number; failed: number; deadLetter: number }> {
  // Ensure handlers are registered
  await import("@/lib/jobs/handlers");

  const limit = options?.limit ?? 10;
  const ids = await claimNextJobs(limit);
  let succeeded = 0;
  let failed = 0;
  let deadLetter = 0;

  for (const id of ids) {
    const result = await processJobById(id);
    if (result.status === "succeeded") succeeded += 1;
    else if (result.status === "dead_letter" || result.status === "needs_attention") {
      deadLetter += 1;
    } else failed += 1;
  }

  return { claimed: ids.length, succeeded, failed, deadLetter };
}

/** Fire-and-forget process after enqueue — never throws to caller. */
export function kickJob(jobId: string) {
  void processJobById(jobId).catch((error) => {
    console.error("[jobs] kick failed", jobId, error);
  });
}

export async function getQueueStats() {
  const [pending, processing, deadLetter, needsAttention, failedRecent] = await Promise.all([
    prisma.backgroundJob.count({ where: { status: "pending" } }),
    prisma.backgroundJob.count({ where: { status: "processing" } }),
    prisma.backgroundJob.count({ where: { status: "dead_letter" } }),
    prisma.backgroundJob.count({ where: { status: "needs_attention" } }),
    prisma.backgroundJob.count({
      where: {
        status: { in: ["dead_letter", "needs_attention", "failed"] },
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);
  return { pending, processing, deadLetter, needsAttention, failedRecent24h: failedRecent };
}
