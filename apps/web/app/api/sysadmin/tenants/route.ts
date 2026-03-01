import { TenantRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTenant, toTenantSlug } from "@/lib/tenant";

type TenantCreateBody = {
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

async function buildUniqueTenantSlug(baseSlug: string): Promise<string> {
  const existing = await prisma.tenant.findUnique({
    where: { slug: baseSlug },
    select: { id: true }
  });
  if (!existing) {
    return baseSlug;
  }

  for (let index = 2; index <= 200; index += 1) {
    const candidate = `${baseSlug}-${index}`;
    const collision = await prisma.tenant.findUnique({
      where: { slug: candidate },
      select: { id: true }
    });
    if (!collision) {
      return candidate;
    }
  }

  throw new Error("Could not allocate unique tenant slug.");
}

export async function GET() {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  await ensureDefaultTenant();

  const tenants = await prisma.tenant.findMany({
    orderBy: [{ createdAt: "asc" }],
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
      },
      memberships: {
        select: {
          role: true
        }
      }
    }
  });

  return NextResponse.json({
    tenants: tenants.map((tenant) => {
      const admins = tenant.memberships.filter((membership) => membership.role === TenantRole.ADMIN).length;
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        supportEmail: tenant.supportEmail,
        timezone: tenant.timezone,
        defaultLanguage: tenant.defaultLanguage === "en" ? "en" : "nb",
        allowLocalAuth: tenant.allowLocalAuth,
        allowAzureAuth: tenant.allowAzureAuth,
        counts: {
          admins,
          members: tenant._count.memberships,
          wheels: tenant._count.wheels
        }
      };
    })
  });
}

export async function POST(request: Request) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  await ensureDefaultTenant();

  const body = (await request.json().catch(() => ({}))) as TenantCreateBody;
  const name = asString(body.name);
  if (!name) {
    return NextResponse.json({ error: "name must be a non-empty string." }, { status: 400 });
  }

  const slugInput = asString(body.slug);
  const slug = toTenantSlug(slugInput ?? name);
  if (!slug) {
    return NextResponse.json({ error: "slug could not be derived from input." }, { status: 400 });
  }

  const supportEmail = body.supportEmail === undefined ? null : normalizeEmail(body.supportEmail);
  if (supportEmail && !supportEmail.includes("@")) {
    return NextResponse.json({ error: "supportEmail must be a valid e-mail." }, { status: 400 });
  }

  const timezone = body.timezone === undefined ? "Europe/Oslo" : asString(body.timezone);
  if (!timezone) {
    return NextResponse.json({ error: "timezone must be a non-empty string." }, { status: 400 });
  }

  const defaultLanguage = body.defaultLanguage === "en" ? "en" : body.defaultLanguage === undefined ? "nb" : null;
  if (!defaultLanguage) {
    return NextResponse.json({ error: "defaultLanguage must be nb or en." }, { status: 400 });
  }

  const allowLocalAuth = body.allowLocalAuth === undefined ? true : body.allowLocalAuth;
  const allowAzureAuth = body.allowAzureAuth === undefined ? true : body.allowAzureAuth;
  if (typeof allowLocalAuth !== "boolean") {
    return NextResponse.json({ error: "allowLocalAuth must be boolean." }, { status: 400 });
  }
  if (typeof allowAzureAuth !== "boolean") {
    return NextResponse.json({ error: "allowAzureAuth must be boolean." }, { status: 400 });
  }
  if (!allowLocalAuth && !allowAzureAuth) {
    return NextResponse.json({ error: "At least one sign-in provider must stay enabled." }, { status: 400 });
  }

  const uniqueSlug = await buildUniqueTenantSlug(slug);

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug: uniqueSlug,
      supportEmail,
      timezone,
      defaultLanguage,
      allowLocalAuth,
      allowAzureAuth
    },
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
      allowAzureAuth: true
    }
  });

  return NextResponse.json(
    {
      tenant: {
        ...tenant,
        defaultLanguage: tenant.defaultLanguage === "en" ? "en" : "nb",
        counts: {
          admins: 0,
          members: 0,
          wheels: 0
        }
      }
    },
    { status: 201 }
  );
}
