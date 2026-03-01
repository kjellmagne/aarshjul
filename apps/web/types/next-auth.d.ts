import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      groups: string[];
      isAdmin: boolean;
      isSystemAdmin: boolean;
      activeTenantId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    groups?: string[];
    isAdmin?: boolean;
    isSystemAdmin?: boolean;
    activeTenantId?: string | null;
  }
}
