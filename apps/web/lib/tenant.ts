import { TenantRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

function normalizeSlugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

export function toTenantSlug(nameOrSlug: string): string {
  const normalized = normalizeSlugPart(nameOrSlug);
  return normalized || "tenant";
}

export async function ensureDefaultTenant() {
  const settings = await prisma.tenantSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default"
    },
    select: {
      tenantName: true,
      supportEmail: true,
      timezone: true,
      defaultLanguage: true,
      allowLocalAuth: true,
      allowAzureAuth: true
    }
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      slug: "default",
      name: settings.tenantName,
      supportEmail: settings.supportEmail,
      timezone: settings.timezone,
      defaultLanguage: settings.defaultLanguage === "en" ? "en" : "nb",
      allowLocalAuth: settings.allowLocalAuth,
      allowAzureAuth: settings.allowAzureAuth
    }
  });

  return tenant;
}

export async function syncUserGlobalAdminFlag(userId: string) {
  const hasTenantAdminRole = await prisma.tenantMembership.count({
    where: {
      userId,
      role: TenantRole.ADMIN,
      isDisabled: false
    }
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      isAdmin: hasTenantAdminRole > 0
    }
  });
}

export async function syncUsersGlobalAdminFlag(userIds: string[]) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) {
    return;
  }

  await Promise.all(ids.map((id) => syncUserGlobalAdminFlag(id)));
}
