import { Prisma, TenantRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { syncUserGlobalAdminFlag } from "@/lib/tenant";

type TenantAdminUpdateBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
};

function asString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function asEmail(value: unknown): string {
  const normalized = asString(value).toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return "";
  }
  return normalized;
}

function isLocalOnlyAccount(user: {
  passwordHash: string | null;
  azureAdObjectId: string | null;
  accounts: { provider: string }[];
}) {
  const hasAzureIdentity =
    Boolean(user.azureAdObjectId) || user.accounts.some((account) => account.provider.toLowerCase() === "azure-ad");
  return Boolean(user.passwordHash) && !hasAzureIdentity;
}

export async function PATCH(request: Request, context: { params: Promise<{ tenantId: string; userId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const params = await context.params;
  const body = (await request.json().catch(() => ({}))) as TenantAdminUpdateBody;
  const hasName = body.name !== undefined;
  const hasEmail = body.email !== undefined;
  const hasPassword = body.password !== undefined;

  if (!hasName && !hasEmail && !hasPassword) {
    return NextResponse.json({ error: "No update fields provided." }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true }
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  const assignment = await prisma.tenantMembership.findFirst({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      role: TenantRole.ADMIN
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          passwordHash: true,
          azureAdObjectId: true,
          accounts: {
            select: {
              provider: true
            }
          }
        }
      }
    }
  });

  if (!assignment) {
    return NextResponse.json({ error: "Tenant admin not found." }, { status: 404 });
  }
  if (!isLocalOnlyAccount(assignment.user)) {
    return NextResponse.json({ error: "Only local tenant admin accounts can be edited here." }, { status: 400 });
  }

  const name = hasName ? asString(body.name) : "";
  const email = hasEmail ? asEmail(body.email) : "";
  const password = hasPassword && typeof body.password === "string" ? body.password : "";

  if (hasEmail && !email) {
    return NextResponse.json({ error: "Invalid e-mail address." }, { status: 400 });
  }
  if (hasPassword && password && password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const data: {
    name?: string | null;
    email?: string;
    passwordHash?: string;
  } = {};

  if (hasName) {
    data.name = name || null;
  }
  if (hasEmail) {
    data.email = email;
  }
  if (hasPassword && password) {
    data.passwordHash = await hash(password, 12);
  }

  try {
    const updated = await prisma.user.update({
      where: { id: params.userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
        isSystemAdmin: true,
        lastLoginAt: true,
        passwordHash: true,
        azureAdObjectId: true,
        accounts: {
          select: {
            provider: true
          }
        }
      }
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        isAdmin: updated.isAdmin,
        isSystemAdmin: updated.isSystemAdmin,
        lastLoginAt: updated.lastLoginAt,
        hasLocalPassword: Boolean(updated.passwordHash),
        hasAzureIdentity:
          Boolean(updated.azureAdObjectId) || updated.accounts.some((account) => account.provider.toLowerCase() === "azure-ad"),
        providers: [...new Set(updated.accounts.map((account) => account.provider))]
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "E-mail is already in use." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ tenantId: string; userId: string }> }) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const systemAdmin = await assertSystemAdminContext(authContext);
  if (systemAdmin instanceof NextResponse) {
    return systemAdmin;
  }

  const params = await context.params;
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode")?.trim() ?? "";

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.tenantId },
    select: { id: true }
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  if (mode === "account") {
    const tenantAdmin = await prisma.tenantMembership.findFirst({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        role: TenantRole.ADMIN
      },
      select: {
        user: {
          select: {
            id: true,
            isSystemAdmin: true,
            passwordHash: true,
            azureAdObjectId: true,
            accounts: {
              select: {
                provider: true
              }
            }
          }
        }
      }
    });

    if (!tenantAdmin) {
      return NextResponse.json({ error: "Tenant admin not found." }, { status: 404 });
    }
    if (tenantAdmin.user.isSystemAdmin) {
      return NextResponse.json({ error: "System admin accounts cannot be deleted here." }, { status: 400 });
    }
    if (!isLocalOnlyAccount(tenantAdmin.user)) {
      return NextResponse.json({ error: "Only local tenant admin accounts can be deleted here." }, { status: 400 });
    }

    const [otherTenantMemberships, ownedWheels] = await prisma.$transaction([
      prisma.tenantMembership.count({
        where: {
          userId: params.userId,
          tenantId: { not: params.tenantId }
        }
      }),
      prisma.wheel.count({
        where: {
          ownerId: params.userId
        }
      })
    ]);

    if (otherTenantMemberships > 0) {
      return NextResponse.json(
        { error: "User has memberships in other tenants. Remove those memberships first." },
        { status: 400 }
      );
    }
    if (ownedWheels > 0) {
      return NextResponse.json(
        { error: "User owns wheels. Reassign or delete those wheels before deleting this account." },
        { status: 400 }
      );
    }

    await prisma.user.delete({
      where: { id: params.userId }
    });

    return NextResponse.json({
      deleted: 1,
      mode: "account"
    });
  }

  const deleted = await prisma.tenantMembership.deleteMany({
    where: {
      tenantId: params.tenantId,
      userId: params.userId,
      role: TenantRole.ADMIN
    }
  });

  await syncUserGlobalAdminFlag(params.userId);

  return NextResponse.json({
    deleted: deleted.count
  });
}
