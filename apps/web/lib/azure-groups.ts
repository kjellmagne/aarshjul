import type { PrismaClient } from "@prisma/client";

export async function ensureAzureGroupsByTenantIds(params: {
  db: PrismaClient;
  tenantGroupIds: string[];
}) {
  const ids = [...new Set(params.tenantGroupIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return [] as Array<{ id: string; tenantGroupId: string; displayName: string | null }>;
  }

  const existing = await params.db.azureGroup.findMany({
    where: { tenantGroupId: { in: ids } }
  });

  const existingSet = new Set(existing.map((entry) => entry.tenantGroupId));
  const missing = ids.filter((id) => !existingSet.has(id));

  if (missing.length > 0) {
    await params.db.azureGroup.createMany({
      data: missing.map((tenantGroupId) => ({ tenantGroupId })),
      skipDuplicates: true
    });
  }

  return params.db.azureGroup.findMany({
    where: { tenantGroupId: { in: ids } },
    select: { id: true, tenantGroupId: true, displayName: true }
  });
}
