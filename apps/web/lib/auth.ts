import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

import { prisma } from "@/lib/prisma";

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

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt"
  },
  providers: [
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
  ],
  callbacks: {
    async jwt({ token, profile }) {
      const azureProfile = profile as AzureProfile | undefined;
      const groups = asGroupList(azureProfile?.groups);
      if (groups.length > 0) {
        token.groups = groups;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.sub === "string") {
        session.user.id = token.sub;
      }
      session.user.groups = asGroupList(token.groups);
      return session;
    }
  },
  events: {
    async signIn({ user, profile }) {
      const azureProfile = profile as AzureProfile | undefined;
      const azureAdObjectId = azureProfile?.oid ?? azureProfile?.sub;
      if (!azureAdObjectId || !user?.id) {
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { azureAdObjectId }
      });
    }
  }
};

export function auth() {
  return getServerSession(authOptions);
}
