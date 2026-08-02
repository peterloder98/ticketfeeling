import { prisma } from "@/lib/db";

type AuditInput = {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

export async function writeAudit(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before as object | undefined,
      after: input.after as object | undefined,
      reason: input.reason,
      ip: input.ip,
      userAgent: input.userAgent,
      requestId: input.requestId,
    },
  });
}
