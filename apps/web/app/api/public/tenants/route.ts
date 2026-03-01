import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { ensureDefaultTenant } from "@/lib/tenant";

export async function GET() {
  await ensureDefaultTenant();

  const tenants = await prisma.tenant.findMany({
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      allowLocalAuth: true,
      allowAzureAuth: true,
      azureTenantId: true,
      azureClientId: true,
      azureClientSecret: true
    }
  });

  return NextResponse.json({
    tenants: tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      allowLocalAuth: tenant.allowLocalAuth,
      allowAzureAuth: tenant.allowAzureAuth,
      azureConfigured: Boolean(tenant.azureTenantId && tenant.azureClientId && tenant.azureClientSecret)
    }))
  });
}
