import { Prisma, TenantRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { assertAdminContext, getAuthContext } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { syncUserGlobalAdminFlag } from "@/lib/tenant";

type TenantUserUpdateBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  isAdmin?: unknown;
  isDisabled?: unknown;
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

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
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

  const params = await context.params;
  const body = (await request.json().catch(() => ({}))) as TenantUserUpdateBody;
  const hasName = body.name !== undefined;
  const hasEmail = body.email !== undefined;
  const hasPassword = body.password !== undefined;
  const hasAdmin = body.isAdmin !== undefined;
  const hasDisabled = body.isDisabled !== undefined;

  if (!hasName && !hasEmail && !hasPassword && !hasAdmin && !hasDisabled) {
    return NextResponse.json({ error: "No update fields provided." }, { status: 400 });
  }

  if (hasAdmin && typeof body.isAdmin !== "boolean") {
    return NextResponse.json({ error: "isAdmin must be boolean." }, { status: 400 });
  }
  if (hasDisabled && typeof body.isDisabled !== "boolean") {
    return NextResponse.json({ error: "isDisabled must be boolean." }, { status: 400 });
  }

  if (params.userId === adminCheck.id && body.isAdmin === false) {
    return NextResponse.json({ error: "You cannot remove admin rights from your own account." }, { status: 400 });
  }
  if (params.userId === adminCheck.id && body.isDisabled === true) {
    return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
  }

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId: params.userId
      }
    },
    select: {
      role: true,
      isDisabled: true,
      user: {
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
      }
    }
  });

  if (!targetMembership) {
    return NextResponse.json({ error: "User is not a member of this tenant." }, { status: 404 });
  }
  if (targetMembership.user.isSystemAdmin) {
    return NextResponse.json({ error: "System admin users cannot be managed from tenant admin." }, { status: 403 });
  }
  const targetHasAzureIdentity = hasAzureIdentity(targetMembership.user);
  if (targetHasAzureIdentity && (hasEmail || hasPassword)) {
    return NextResponse.json(
      { error: "Azure AD accounts cannot have local email/password updated here." },
      { status: 400 }
    );
  }

  const userData: {
    name?: string | null;
    email?: string;
    passwordHash?: string;
  } = {};
  if (hasName) {
    const name = asString(body.name);
    userData.name = name || null;
  }
  if (hasEmail) {
    const email = asEmail(body.email);
    if (!email) {
      return NextResponse.json({ error: "Invalid e-mail address." }, { status: 400 });
    }
    userData.email = email;
  }
  if (hasPassword) {
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length > 0 && password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (password.length > 0) {
      userData.passwordHash = await hash(password, 12);
    }
  }

  const membershipData: {
    role?: TenantRole;
    isDisabled?: boolean;
  } = {};
  if (hasAdmin) {
    membershipData.role = body.isAdmin ? TenantRole.ADMIN : TenantRole.MEMBER;
  }
  if (hasDisabled) {
    membershipData.isDisabled = Boolean(body.isDisabled);
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (Object.keys(userData).length > 0) {
        await tx.user.update({
          where: { id: params.userId },
          data: userData
        });
      }
      if (Object.keys(membershipData).length > 0) {
        await tx.tenantMembership.update({
          where: {
            tenantId_userId: {
              tenantId,
              userId: params.userId
            }
          },
          data: membershipData
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "E-mail is already in use." }, { status: 409 });
    }
    throw error;
  }

  await syncUserGlobalAdminFlag(params.userId);
  const mappedUser = await getTenantUserRow(tenantId, params.userId);
  if (!mappedUser) {
    return NextResponse.json({ error: "Could not load updated user." }, { status: 500 });
  }

  return NextResponse.json({ user: mappedUser });
}

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
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

  const params = await context.params;
  if (params.userId === adminCheck.id) {
    return NextResponse.json({ error: "You cannot delete your own account from this tenant." }, { status: 400 });
  }

  const targetMembership = await prisma.tenantMembership.findUnique({
    where: {
      tenantId_userId: {
        tenantId,
        userId: params.userId
      }
    },
    select: {
      user: {
        select: {
          id: true,
          isSystemAdmin: true
        }
      }
    }
  });

  if (!targetMembership) {
    return NextResponse.json({ error: "User is not a member of this tenant." }, { status: 404 });
  }
  if (targetMembership.user.isSystemAdmin) {
    return NextResponse.json({ error: "System admin users cannot be managed from tenant admin." }, { status: 403 });
  }

  const ownedWheelsInTenant = await prisma.wheel.count({
    where: {
      ownerId: params.userId,
      tenantId
    }
  });
  if (ownedWheelsInTenant > 0) {
    return NextResponse.json(
      { error: "User owns wheels in this tenant. Transfer ownership before deleting the user." },
      { status: 400 }
    );
  }

  const deletedUser = await prisma.$transaction(async (tx) => {
    await tx.wheelShare.deleteMany({
      where: {
        targetType: "USER",
        userId: params.userId,
        wheel: {
          tenantId
        }
      }
    });

    await tx.tenantMembership.delete({
      where: {
        tenantId_userId: {
          tenantId,
          userId: params.userId
        }
      }
    });

    const remainingMemberships = await tx.tenantMembership.count({
      where: { userId: params.userId }
    });

    if (remainingMemberships > 0) {
      return false;
    }

    const ownedWheelsTotal = await tx.wheel.count({
      where: { ownerId: params.userId }
    });
    if (ownedWheelsTotal > 0) {
      return false;
    }

    await tx.user.delete({
      where: { id: params.userId }
    });
    return true;
  });

  if (!deletedUser) {
    await syncUserGlobalAdminFlag(params.userId);
  }

  return NextResponse.json({
    removed: 1,
    deletedUser
  });
}
