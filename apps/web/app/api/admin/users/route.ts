import { TenantRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { assertAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { syncUserGlobalAdminFlag } from "@/lib/tenant";

type AdminUserCreateBody = {
  email?: unknown;
  name?: unknown;
  password?: unknown;
  isAdmin?: unknown;
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

function asOptionalName(value: unknown): string | null {
  const normalized = asString(value);
  return normalized.length > 0 ? normalized : null;
}

function hasAzureIdentity(user: { azureAdObjectId: string | null; accounts: { provider: string }[] }) {
  return Boolean(user.azureAdObjectId) || user.accounts.some((account) => account.provider.toLowerCase() === "azure-ad");
}

async function resolveTenantId(params: { userId: string; requestedTenantId: string | null; activeTenantId: string | null }) {
  const preferredTenantId = params.requestedTenantId || params.activeTenantId;
  if (preferredTenantId) {
    const membership = await prisma.tenantMembership.findFirst({
      where: {
        userId: params.userId,
        tenantId: preferredTenantId,
        role: TenantRole.ADMIN,
        isDisabled: false
      },
      select: {
        tenantId: true
      }
    });
    return membership?.tenantId ?? null;
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId: params.userId,
      role: TenantRole.ADMIN,
      isDisabled: false
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      tenantId: true
    }
  });
  return membership?.tenantId ?? null;
}

async function getTenantUserRow(tenantId: string, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      lastLoginAt: true,
      createdAt: true,
      passwordHash: true,
      azureAdObjectId: true,
      accounts: {
        select: {
          provider: true
        }
      },
      _count: {
        select: {
          ownedWheels: {
            where: {
              tenantId
            }
          },
          wheelUserShares: {
            where: {
              wheel: {
                tenantId
              }
            }
          },
          activitiesCreated: {
            where: {
              wheel: {
                tenantId
              }
            }
          }
        }
      },
      tenantMemberships: {
        where: {
          tenantId
        },
        select: {
          role: true,
          isDisabled: true
        }
      }
    }
  });

  if (!user) {
    return null;
  }
  const membership = user.tenantMemberships[0];
  if (!membership) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: membership.role,
    isAdmin: membership.role === TenantRole.ADMIN,
    isDisabled: membership.isDisabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    hasLocalPassword: Boolean(user.passwordHash),
    hasAzureIdentity: hasAzureIdentity(user),
    providers: [...new Set(user.accounts.map((account) => account.provider))],
    counts: user._count
  };
}

export async function GET(request: Request) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const adminCheck = await assertAdminContext(authContext);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const requestedTenantId = new URL(request.url).searchParams.get("tenantId")?.trim() || null;
  const tenantId = await resolveTenantId({
    userId: adminCheck.id,
    requestedTenantId,
    activeTenantId: authContext.activeTenantId
  });
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found or not accessible." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      isSystemAdmin: false,
      tenantMemberships: {
        some: {
          tenantId
        }
      }
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      lastLoginAt: true,
      createdAt: true,
      passwordHash: true,
      azureAdObjectId: true,
      accounts: {
        select: {
          provider: true
        }
      },
      _count: {
        select: {
          ownedWheels: {
            where: {
              tenantId
            }
          },
          wheelUserShares: {
            where: {
              wheel: {
                tenantId
              }
            }
          },
          activitiesCreated: {
            where: {
              wheel: {
                tenantId
              }
            }
          }
        }
      },
      tenantMemberships: {
        where: {
          tenantId
        },
        select: {
          role: true,
          isDisabled: true
        }
      }
    }
  });

  return NextResponse.json({
    tenantId,
    users: users
      .map((user) => {
        const membership = user.tenantMemberships[0];
        if (!membership) {
          return null;
        }
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: membership.role,
          isAdmin: membership.role === TenantRole.ADMIN,
          isDisabled: membership.isDisabled,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
          hasLocalPassword: Boolean(user.passwordHash),
          hasAzureIdentity: hasAzureIdentity(user),
          providers: [...new Set(user.accounts.map((account) => account.provider))],
          counts: user._count
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  });
}

export async function POST(request: Request) {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  const adminCheck = await assertAdminContext(authContext);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const requestedTenantId = new URL(request.url).searchParams.get("tenantId")?.trim() || null;
  const tenantId = await resolveTenantId({
    userId: adminCheck.id,
    requestedTenantId,
    activeTenantId: authContext.activeTenantId
  });
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant not found or not accessible." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as AdminUserCreateBody;
  const email = asEmail(body.email);
  const name = asOptionalName(body.name);
  const password = typeof body.password === "string" ? body.password : "";
  const isAdmin = Boolean(body.isAdmin);
  const role = isAdmin ? TenantRole.ADMIN : TenantRole.MEMBER;

  if (!email) {
    return NextResponse.json({ error: "Valid e-mail is required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      isSystemAdmin: true,
      azureAdObjectId: true,
      accounts: {
        select: {
          provider: true
        }
      }
    }
  });

  const passwordHash = await hash(password, 12);
  let userId = existing?.id ?? "";

  if (existing) {
    if (existing.isSystemAdmin) {
      return NextResponse.json({ error: "System admin accounts cannot be managed here." }, { status: 403 });
    }
    if (hasAzureIdentity(existing)) {
      return NextResponse.json({ error: "Azure AD accounts must be managed through Azure AD." }, { status: 400 });
    }

    const otherTenantMemberships = await prisma.tenantMembership.count({
      where: {
        userId: existing.id,
        tenantId: {
          not: tenantId
        }
      }
    });
    if (otherTenantMemberships > 0) {
      return NextResponse.json(
        { error: "User already belongs to another tenant. Use a tenant-specific account." },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          ...(name ? { name } : {})
        }
      });
      await tx.tenantMembership.upsert({
        where: {
          tenantId_userId: {
            tenantId,
            userId: existing.id
          }
        },
        update: {
          role,
          isDisabled: false
        },
        create: {
          tenantId,
          userId: existing.id,
          role,
          isDisabled: false
        }
      });
    });

    userId = existing.id;
  } else {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          ...(name ? { name } : {})
        },
        select: { id: true }
      });

      await tx.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          role,
          isDisabled: false
        }
      });

      return user;
    });

    userId = created.id;
  }

  await syncUserGlobalAdminFlag(userId);
  const mappedUser = await getTenantUserRow(tenantId, userId);
  if (!mappedUser) {
    return NextResponse.json({ error: "Could not load created user." }, { status: 500 });
  }

  return NextResponse.json({ user: mappedUser }, { status: 201 });
}
