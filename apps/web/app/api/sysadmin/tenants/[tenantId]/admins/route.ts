import { TenantRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { assertSystemAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";

type TenantAdminAssignBody = {
  mode?: unknown;
  userId?: unknown;
  email?: unknown;
  name?: unknown;
  password?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asEmail(value: unknown): string | null {
  const normalized = asString(value)?.toLowerCase() ?? null;
  if (!normalized || !normalized.includes("@")) {
    return null;
  }
  return normalized;
}

function asOptionalName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

function mapAssignment(
  assignment: {
    tenantId: string;
    userId: string;
    role: TenantRole;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: string;
      email: string | null;
      name: string | null;
      isSystemAdmin: boolean;
      isAdmin: boolean;
      lastLoginAt: Date | null;
      passwordHash: string | null;
      azureAdObjectId: string | null;
      accounts: { provider: string }[];
    };
  }
) {
  return {
    tenantId: assignment.tenantId,
    userId: assignment.userId,
    role: assignment.role,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    user: {
      id: assignment.user.id,
      email: assignment.user.email,
      name: assignment.user.name,
      isSystemAdmin: assignment.user.isSystemAdmin,
      isAdmin: assignment.user.isAdmin,
      lastLoginAt: assignment.user.lastLoginAt,
      hasLocalPassword: Boolean(assignment.user.passwordHash),
      hasAzureIdentity:
        Boolean(assignment.user.azureAdObjectId) ||
        assignment.user.accounts.some((account) => account.provider.toLowerCase() === "azure-ad"),
      providers: [...new Set(assignment.user.accounts.map((account) => account.provider))]
    }
  };
}

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
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
    select: { id: true, name: true, slug: true }
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  const assignments = await prisma.tenantMembership.findMany({
    where: {
      tenantId: params.tenantId,
      role: TenantRole.ADMIN
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      tenantId: true,
      userId: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isSystemAdmin: true,
          isAdmin: true,
          lastLoginAt: true,
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

  return NextResponse.json({
    tenant,
    admins: assignments.map(mapAssignment)
  });
}

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
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
    select: { id: true, name: true, slug: true }
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as TenantAdminAssignBody;
  const mode = asString(body.mode);
  const userId = asString(body.userId);
  const email = asEmail(body.email);
  const name = asOptionalName(body.name);
  const password = typeof body.password === "string" ? body.password : "";

  if (mode === "createLocal") {
    if (!email) {
      return NextResponse.json({ error: "Valid e-mail is required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const passwordHash = await hash(password, 12);
    const user = await prisma.user.findUnique({
      where: { email },
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
    });

    let tenantAdminUserId = "";

    if (user) {
      if (!isLocalOnlyAccount(user)) {
        return NextResponse.json(
          { error: "Only local accounts can be used as tenant admins in this view." },
          { status: 400 }
        );
      }
      const otherTenantMemberships = await prisma.tenantMembership.count({
        where: {
          userId: user.id,
          tenantId: {
            not: params.tenantId
          }
        }
      });
      if (otherTenantMemberships > 0) {
        return NextResponse.json(
          { error: "User already belongs to another tenant. Use a tenant-specific local account." },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            ...(name ? { name } : {})
          }
        });

        await tx.tenantMembership.upsert({
          where: {
            tenantId_userId: {
              tenantId: params.tenantId,
              userId: user.id
            }
          },
          update: {
            role: TenantRole.ADMIN
          },
          create: {
            tenantId: params.tenantId,
            userId: user.id,
            role: TenantRole.ADMIN
          }
        });

        await tx.user.update({
          where: { id: user.id },
          data: { isAdmin: true }
        });
      });

      tenantAdminUserId = user.id;
    } else {
      const created = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email,
            passwordHash,
            isAdmin: true,
            ...(name ? { name } : {})
          },
          select: { id: true }
        });

        await tx.tenantMembership.create({
          data: {
            tenantId: params.tenantId,
            userId: createdUser.id,
            role: TenantRole.ADMIN
          }
        });

        return createdUser;
      });

      tenantAdminUserId = created.id;
    }

    const createdAssignment = await prisma.tenantMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId: params.tenantId,
          userId: tenantAdminUserId
        }
      },
      select: {
        tenantId: true,
        userId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isSystemAdmin: true,
            isAdmin: true,
            lastLoginAt: true,
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

    if (!createdAssignment) {
      return NextResponse.json({ error: "Could not load created tenant admin." }, { status: 500 });
    }

    return NextResponse.json({
      tenant,
      admin: mapAssignment(createdAssignment)
    });
  }

  let user = null as null | {
    id: string;
    email: string | null;
    name: string | null;
    isSystemAdmin: boolean;
    isAdmin: boolean;
    lastLoginAt: Date | null;
    passwordHash: string | null;
    azureAdObjectId: string | null;
    accounts: { provider: string }[];
  };

  if (userId) {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        isSystemAdmin: true,
        isAdmin: true,
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
  } else if (email) {
    user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        isSystemAdmin: true,
        isAdmin: true,
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
  } else {
    return NextResponse.json({ error: "userId or email is required." }, { status: 400 });
  }

  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (!isLocalOnlyAccount(user)) {
    return NextResponse.json({ error: "Only local accounts can be tenant admins in this view." }, { status: 400 });
  }
  const otherTenantMemberships = await prisma.tenantMembership.count({
    where: {
      userId: user.id,
      tenantId: {
        not: params.tenantId
      }
    }
  });
  if (otherTenantMemberships > 0) {
    return NextResponse.json(
      { error: "User already belongs to another tenant. Use a tenant-specific local account." },
      { status: 400 }
    );
  }

  const assignment = await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: params.tenantId,
        userId: user.id
      }
    },
    update: {
      role: TenantRole.ADMIN
    },
    create: {
      tenantId: params.tenantId,
      userId: user.id,
      role: TenantRole.ADMIN
    },
    select: {
      tenantId: true,
      userId: true,
      role: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!user.isAdmin) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isAdmin: true }
    });
  }

  return NextResponse.json({
    tenant,
    admin: {
      ...assignment,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isSystemAdmin: user.isSystemAdmin,
        isAdmin: true,
        lastLoginAt: user.lastLoginAt,
        hasLocalPassword: Boolean(user.passwordHash),
        hasAzureIdentity:
          Boolean(user.azureAdObjectId) || user.accounts.some((account) => account.provider.toLowerCase() === "azure-ad"),
        providers: [...new Set(user.accounts.map((account) => account.provider))]
      }
    }
  });
}
