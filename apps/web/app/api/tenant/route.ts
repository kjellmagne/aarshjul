import { NextResponse } from "next/server";

import { ensureDefaultTenant } from "@/lib/tenant";

export async function GET() {
  const tenant = await ensureDefaultTenant();

  return NextResponse.json({
    tenant: {
      tenantName: tenant.name,
      allowLocalAuth: tenant.allowLocalAuth,
      allowAzureAuth: tenant.allowAzureAuth,
      defaultLanguage: tenant.defaultLanguage === "en" ? "en" : "nb",
      timezone: tenant.timezone
    }
  });
}
