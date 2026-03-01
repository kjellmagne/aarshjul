import { NextResponse } from "next/server";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { syncUsersGlobalAdminFlag, toTenantSlug } from "@/lib/tenant";

type TenantPatchBody = {
  name?: unknown;
  slug?: unknown;
  supportEmail?: unknown;
  timezone?: unknown;
  defaultLanguage?: unknown;
  allowLocalAuth?: unknown;
  allowAzureAuth?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmail(value: unknown): string | null {
  const normalized = asString(value);
  if (!normalized) {
    return null;
  }
  return normalized.toLowerCase();
}

export async function PATCH(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const params = await context.params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true, slug: true }
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as TenantPatchBody;
  const data: {
    name?: string;
    slug?: string;
    supportEmail?: string | null;
    timezone?: string;
    defaultLanguage?: "nb" | "en";
    allowLocalAuth?: boolean;
    allowAzureAuth?: boolean;
  } = {};

  if (body.name !== undefined) {
    const name = asString(body.name);
    if (!name) {
      return NextResponse.json({ error: "name must be a non-empty string." }, { status: 400 });
    }
    data.name = name;
  }

  if (body.slug !== undefined) {
    const rawSlug = asString(body.slug);
    if (!rawSlug) {
      return NextResponse.json({ error: "slug must be a non-empty string." }, { status: 400 });
    }
    const slug = toTenantSlug(rawSlug);
    if (!slug) {
      return NextResponse.json({ error: "slug could not be normalized." }, { status: 400 });
    }
    if (tenant.slug === "default" && slug !== "default") {
      return NextResponse.json({ error: "Default tenant slug cannot be changed." }, { status: 400 });
    }
    data.slug = slug;
  }

  if (body.supportEmail !== undefined) {
    const supportEmail = normalizeEmail(body.supportEmail);
    if (supportEmail && !supportEmail.includes("@")) {
      return NextResponse.json({ error: "supportEmail must be a valid e-mail." }, { status: 400 });
    }
    data.supportEmail = supportEmail;
  }

  if (body.timezone !== undefined) {
    const timezone = asString(body.timezone);
    if (!timezone) {
      return NextResponse.json({ error: "timezone must be a non-empty string." }, { status: 400 });
    }
    data.timezone = timezone;
  }

  if (body.defaultLanguage !== undefined) {
    if (body.defaultLanguage !== "nb" && body.defaultLanguage !== "en") {
      return NextResponse.json({ error: "defaultLanguage must be nb or en." }, { status: 400 });
    }
    data.defaultLanguage = body.defaultLanguage;
  }

  if (body.allowLocalAuth !== undefined) {
    if (typeof body.allowLocalAuth !== "boolean") {
      return NextResponse.json({ error: "allowLocalAuth must be boolean." }, { status: 400 });
    }
    data.allowLocalAuth = body.allowLocalAuth;
  }

  if (body.allowAzureAuth !== undefined) {
    if (typeof body.allowAzureAuth !== "boolean") {
      return NextResponse.json({ error: "allowAzureAuth must be boolean." }, { status: 400 });
    }
    data.allowAzureAuth = body.allowAzureAuth;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No tenant fields provided." }, { status: 400 });
  }

  const current = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: {
      allowLocalAuth: true,
      allowAzureAuth: true
    }
  });
  if (!current) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }
  const allowLocalAuth = data.allowLocalAuth ?? current.allowLocalAuth;
  const allowAzureAuth = data.allowAzureAuth ?? current.allowAzureAuth;
  if (!allowLocalAuth && !allowAzureAuth) {
    return NextResponse.json({ error: "At least one sign-in provider must stay enabled." }, { status: 400 });
  }

  try {
    const updated = await prisma.tenant.update({
      where: { id: params.tenantId },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        supportEmail: true,
        timezone: true,
        defaultLanguage: true,
        allowLocalAuth: true,
        allowAzureAuth: true,
        _count: {
          select: {
            memberships: true,
            wheels: true
          }
        }
      }
    });

    return NextResponse.json({
      tenant: {
        ...updated,
        defaultLanguage: updated.defaultLanguage === "en" ? "en" : "nb",
        counts: {
          members: updated._count.memberships,
          wheels: updated._count.wheels
        }
      }
    });
  } catch {
    return NextResponse.json({ error: "Could not update tenant (name/slug may already exist)." }, { status: 409 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const params = await context.params;
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: {
      id: true,
      slug: true,
      memberships: {
        where: {
          role: "ADMIN"
        },
        select: {
          userId: true
        }
      }
    }
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  if (tenant.slug === "default") {
    return NextResponse.json({ error: "Default tenant cannot be deleted." }, { status: 400 });
  }

  await prisma.tenant.delete({
    where: { id: tenant.id }
  });

  await syncUsersGlobalAdminFlag(tenant.memberships.map((entry) => entry.userId));

  return NextResponse.json({ deleted: true });
}
