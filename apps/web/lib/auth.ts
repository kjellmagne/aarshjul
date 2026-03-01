import { TenantRole } from "@prisma/client";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

import { isBootstrapAdminEmail, isBootstrapSystemAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { ensureDefaultTenant } from "@/lib/tenant";

type AzureProfile = {
  oid?: string;
  sub?: string;
  groups?: string[];
};

function asGroupList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function asEmail(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

function asText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function parseDelimitedSet(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }
  return new Set(
    value
      .split(/[,;\s]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

const systemAdminGroupIds = parseDelimitedSet(process.env.SYSTEM_ADMIN_GROUP_IDS);
const localSystemAdminUsername = asText(process.env.SYSTEM_ADMIN_LOCAL_USERNAME || "sysadmin").toLowerCase();
const localSystemAdminPassword = process.env.SYSTEM_ADMIN_LOCAL_PASSWORD || "sysadmin";
const localSystemAdminEmail = asEmail(process.env.SYSTEM_ADMIN_LOCAL_EMAIL) || "sysadmin@local";
const localSystemAdminName = asText(process.env.SYSTEM_ADMIN_LOCAL_NAME || "System Admin") || "System Admin";

async function ensureLocalSystemAdminUser() {
  return prisma.user.upsert({
    where: { email: localSystemAdminEmail },
    update: {
      name: localSystemAdminName,
      isAdmin: true,
      isSystemAdmin: true
    },
    create: {
      email: localSystemAdminEmail,
      name: localSystemAdminName,
      isAdmin: true,
      isSystemAdmin: true
    },
    select: {
      id: true,
      email: true,
      name: true
    }
  });
}

async function ensureBootstrapRoles(email: string | null | undefined) {
  const normalizedEmail = asEmail(email);
  if (!normalizedEmail) {
    return;
  }

  const setAdmin = isBootstrapAdminEmail(normalizedEmail);
  const setSystemAdmin = isBootstrapSystemAdminEmail(normalizedEmail);
  if (!setAdmin && !setSystemAdmin) {
    return;
  }

  await prisma.user.updateMany({
    where: {
      email: normalizedEmail
    },
    data: {
      ...(setAdmin ? { isAdmin: true } : {}),
      ...(setSystemAdmin ? { isSystemAdmin: true } : {})
    }
  });
}

async function ensureSystemAdminFromGroups(userId: string, groups: string[]) {
  if (!userId || groups.length === 0 || systemAdminGroupIds.size === 0) {
    return;
  }
  const hasSystemAdminGroup = groups.some((group) => systemAdminGroupIds.has(group));
  if (!hasSystemAdminGroup) {
    return;
  }

  await prisma.user.updateMany({
    where: {
      id: userId,
      isSystemAdmin: false
    },
    data: {
      isSystemAdmin: true
    }
  });
}

async function ensureUserHasTenantMembership(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSystemAdmin: true }
  });
  if (user?.isSystemAdmin) {
    return null;
  }

  const firstMembership = await prisma.tenantMembership.findFirst({
    where: {
      userId,
      isDisabled: false
    },
    orderBy: [{ createdAt: "asc" }],
    select: { tenantId: true }
  });
  if (firstMembership) {
    return firstMembership.tenantId;
  }

  const hasDisabledMembership = await prisma.tenantMembership.findFirst({
    where: { userId },
    select: { id: true }
  });
  if (hasDisabledMembership) {
    return null;
  }

  const defaultTenant = await ensureDefaultTenant();
  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: defaultTenant.id,
        userId
      }
    },
    update: {
      role: TenantRole.MEMBER,
      isDisabled: false
    },
    create: {
      tenantId: defaultTenant.id,
      userId,
      role: TenantRole.MEMBER,
      isDisabled: false
    }
  });

  return defaultTenant.id;
}

async function resolveActiveTenantForUser(params: {
  userId: string;
  preferredTenantId?: string | null;
}) {
  const fallbackTenantId = await ensureUserHasTenantMembership(params.userId);
  const memberships = await prisma.tenantMembership.findMany({
    where: {
      userId: params.userId,
      isDisabled: false
    },
    orderBy: [{ createdAt: "asc" }],
    select: { tenantId: true }
  });
  const tenantIds = memberships.map((entry) => entry.tenantId);

  if (params.preferredTenantId && tenantIds.includes(params.preferredTenantId)) {
    return params.preferredTenantId;
  }

  if (tenantIds.length > 0) {
    return tenantIds[0]!;
  }

  return fallbackTenantId ?? null;
}

const azureConfigured =
  Boolean(process.env.AZURE_AD_CLIENT_ID) &&
  Boolean(process.env.AZURE_AD_CLIENT_SECRET) &&
  Boolean(process.env.AZURE_AD_TENANT_ID);

const providers = [
  ...(azureConfigured
    ? [
        AzureADProvider({
          clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
          tenantId: process.env.AZURE_AD_TENANT_ID ?? "",
          authorization: {
            params: {
              scope: "openid profile email"
            }
          }
        })
      ]
    : []),
  CredentialsProvider({
    id: "sysadmin-local",
    name: "System admin",
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Password", type: "password" }
    },
    async authorize(credentials) {
      const username = asText(credentials?.username).toLowerCase();
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      if (!username || !password) {
        return null;
      }

      if (username !== localSystemAdminUsername || password !== localSystemAdminPassword) {
        return null;
      }

      const user = await ensureLocalSystemAdminUser();
      return {
        id: user.id,
        email: user.email,
        name: user.name
      };
    }
  }),
  CredentialsProvider({
    id: "credentials",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" }
    },
    async authorize(credentials) {
      const email = asEmail(credentials?.email);
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      if (!email || !password) {
        return null;
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          isSystemAdmin: true
        }
      });

      if (!user?.passwordHash) {
        return null;
      }

      const valid = await compare(password, user.passwordHash);
      if (!valid) {
        return null;
      }

      if (!user.isSystemAdmin) {
        const activeMemberships = await prisma.tenantMembership.count({
          where: {
            userId: user.id,
            isDisabled: false
          }
        });
        if (activeMemberships === 0) {
          return null;
        }
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name
      };
    }
  })
];

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt"
  },
  providers,
  callbacks: {
    async jwt({ token, profile, trigger, session }) {
      const azureProfile = profile as AzureProfile | undefined;
      const groupsFromProfile = asGroupList(azureProfile?.groups);
      if (groupsFromProfile.length > 0) {
        token.groups = groupsFromProfile;
      }
      const groups = groupsFromProfile.length > 0 ? groupsFromProfile : asGroupList(token.groups);

      if (typeof token.email === "string" && token.email.length > 0) {
        await ensureBootstrapRoles(token.email);
      }

      if (typeof token.sub === "string" && groups.length > 0) {
        await ensureSystemAdminFromGroups(token.sub, groups);
      }

      const preferredTenantId =
        trigger === "update" && typeof session?.activeTenantId === "string"
          ? session.activeTenantId
          : typeof token.activeTenantId === "string"
            ? token.activeTenantId
            : null;

      if (typeof token.sub === "string") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { id: true, isAdmin: true, isSystemAdmin: true }
        });
        token.isAdmin = Boolean(dbUser?.isAdmin);
        token.isSystemAdmin = Boolean(dbUser?.isSystemAdmin);
        if (dbUser?.id) {
          token.activeTenantId = await resolveActiveTenantForUser({
            userId: dbUser.id,
            preferredTenantId
          });
        } else {
          token.activeTenantId = null;
        }
      } else if (typeof token.email === "string") {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email.toLowerCase() },
          select: { id: true, isAdmin: true, isSystemAdmin: true }
        });
        token.isAdmin = Boolean(dbUser?.isAdmin);
        token.isSystemAdmin = Boolean(dbUser?.isSystemAdmin);
        if (dbUser?.id) {
          token.activeTenantId = await resolveActiveTenantForUser({
            userId: dbUser.id,
            preferredTenantId
          });
        } else {
          token.activeTenantId = null;
        }
      } else {
        token.isAdmin = false;
        token.isSystemAdmin = false;
        token.activeTenantId = null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.sub === "string") {
        session.user.id = token.sub;
      }
      session.user.groups = asGroupList(token.groups);
      session.user.isAdmin = Boolean(token.isAdmin);
      session.user.isSystemAdmin = Boolean(token.isSystemAdmin);
      session.user.activeTenantId = typeof token.activeTenantId === "string" ? token.activeTenantId : null;
      return session;
    }
  },
  events: {
    async signIn({ user, profile }) {
      const azureProfile = profile as AzureProfile | undefined;
      const azureAdObjectId = azureProfile?.oid ?? azureProfile?.sub;
      if (!user?.id) {
        return;
      }

      await ensureBootstrapRoles(user.email);
      await ensureSystemAdminFromGroups(user.id, asGroupList(azureProfile?.groups));
      await ensureUserHasTenantMembership(user.id);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(azureAdObjectId ? { azureAdObjectId } : {}),
          lastLoginAt: new Date()
        }
      });
    }
  }
};

export function auth() {
  return getServerSession(authOptions);
}
