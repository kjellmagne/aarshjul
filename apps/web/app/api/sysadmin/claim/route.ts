import { NextResponse } from "next/server";

import { getAuthContext, getOrCreateUserFromContext } from "@/lib/access";
import { isBootstrapSystemAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const authContext = await getAuthContext();
  if (authContext instanceof NextResponse) {
    return authContext;
  }

  let user;
  try {
    user = await getOrCreateUserFromContext(authContext);
  } catch {
    return NextResponse.json({ error: "Signed-in user is missing required profile data." }, { status: 400 });
  }

  if (user.isSystemAdmin) {
    return NextResponse.json({
      claimed: false,
      alreadySystemAdmin: true,
      reason: "already_system_admin",
      user: {
        id: user.id,
        email: user.email,
        isSystemAdmin: true
      }
    });
  }

  const bootstrapEmailAllowed = isBootstrapSystemAdminEmail(authContext.email);
  const currentSystemAdminCount = await prisma.user.count({
    where: { isSystemAdmin: true }
  });
  const firstSystemAdminAllowed = currentSystemAdminCount === 0;

  if (!bootstrapEmailAllowed && !firstSystemAdminAllowed) {
    return NextResponse.json(
      {
        error: "System admin already configured. Ask an existing system admin to grant access."
      },
      { status: 403 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isSystemAdmin: true },
    select: {
      id: true,
      email: true,
      isSystemAdmin: true
    }
  });

  return NextResponse.json({
    claimed: true,
    alreadySystemAdmin: false,
    reason: firstSystemAdminAllowed ? "first_system_admin" : "bootstrap_email",
    user: updated
  });
}
