import { NextResponse } from "next/server";

import { getAuthContext, getOrCreateUserFromContext } from "@/lib/access";
import { isBootstrapAdminEmail } from "@/lib/admin";
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

  if (user.isAdmin) {
    return NextResponse.json({
      claimed: false,
      alreadyAdmin: true,
      reason: "already_admin",
      user: {
        id: user.id,
        email: user.email,
        isAdmin: true
      }
    });
  }

  const bootstrapEmailAllowed = isBootstrapAdminEmail(authContext.email);
  const currentAdminCount = await prisma.user.count({
    where: { isAdmin: true }
  });
  const firstAdminAllowed = currentAdminCount === 0;

  if (!bootstrapEmailAllowed && !firstAdminAllowed) {
    return NextResponse.json(
      {
        error: "Admin already configured. Ask an existing admin to grant access."
      },
      { status: 403 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { isAdmin: true },
    select: {
      id: true,
      email: true,
      isAdmin: true
    }
  });

  return NextResponse.json({
    claimed: true,
    alreadyAdmin: false,
    reason: firstAdminAllowed ? "first_admin" : "bootstrap_email",
    user: updated
  });
}
