import { TenantRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { assertAdminContext, getAuthContext } from "@/lib/access";
import { sendEmailWithSmtp } from "@/lib/email";
import { prisma } from "@/lib/prisma";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return normalized.includes("@") ? normalized : null;
}

function parsePort(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized || !/^\d+$/.test(normalized)) {
      return null;
    }
    return Number.parseInt(normalized, 10);
  }
  return null;
}

async function resolveTenantForAdmin(params: { userId: string; tenantId: string | null; activeTenantId: string | null }) {
  const preferredTenantId = params.tenantId || params.activeTenantId;
  if (preferredTenantId) {
    const membership = await prisma.tenantMembership.findFirst({
      where: {
        userId: params.userId,
        role: TenantRole.ADMIN,
        tenantId: preferredTenantId,
        isDisabled: false
      },
      select: {
        tenant: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });
    return membership?.tenant ?? null;
  }

  const membership = await prisma.tenantMembership.findFirst({
    where: {
      userId: params.userId,
      role: TenantRole.ADMIN,
      isDisabled: false
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      tenant: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
  return membership?.tenant ?? null;
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

  const url = new URL(request.url);
  const tenantId = url.searchParams.get("tenantId")?.trim() || null;
  const tenant = await resolveTenantForAdmin({
    userId: adminCheck.id,
    tenantId,
    activeTenantId: authContext.activeTenantId
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found or not accessible." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    to?: unknown;
    smtpHost?: unknown;
    smtpPort?: unknown;
    smtpSecure?: unknown;
    smtpUser?: unknown;
    smtpPass?: unknown;
    smtpFrom?: unknown;
    smtpReplyTo?: unknown;
  };

  const to = normalizeEmail(body.to) ?? normalizeEmail(authContext.email);
  if (!to) {
    return NextResponse.json({ error: "A valid test recipient e-mail is required." }, { status: 400 });
  }

  if (typeof body.smtpHost !== "string" || !body.smtpHost.trim()) {
    return NextResponse.json({ error: "smtpHost is required." }, { status: 400 });
  }
  const smtpPort = parsePort(body.smtpPort);
  if (!smtpPort || smtpPort < 1 || smtpPort > 65535) {
    return NextResponse.json({ error: "smtpPort must be a number between 1 and 65535." }, { status: 400 });
  }
  if (typeof body.smtpFrom !== "string" || !normalizeEmail(body.smtpFrom)) {
    return NextResponse.json({ error: "smtpFrom must be a valid e-mail." }, { status: 400 });
  }
  if (body.smtpSecure !== undefined && typeof body.smtpSecure !== "boolean") {
    return NextResponse.json({ error: "smtpSecure must be boolean." }, { status: 400 });
  }
  if (body.smtpUser !== undefined && body.smtpUser !== null && typeof body.smtpUser !== "string") {
    return NextResponse.json({ error: "smtpUser must be string or null." }, { status: 400 });
  }
  if (body.smtpPass !== undefined && body.smtpPass !== null && typeof body.smtpPass !== "string") {
    return NextResponse.json({ error: "smtpPass must be string or null." }, { status: 400 });
  }
  if (body.smtpReplyTo !== undefined && body.smtpReplyTo !== null && typeof body.smtpReplyTo !== "string") {
    return NextResponse.json({ error: "smtpReplyTo must be string or null." }, { status: 400 });
  }
  if (typeof body.smtpReplyTo === "string" && body.smtpReplyTo.trim() && !normalizeEmail(body.smtpReplyTo)) {
    return NextResponse.json({ error: "smtpReplyTo must be a valid e-mail." }, { status: 400 });
  }

  await sendEmailWithSmtp(
    {
      to,
      subject: `Aarshjul test e-post (${tenant.name})`,
      text: [
        "Dette er en test-e-post fra Aarshjul.",
        `Tenant: ${tenant.name}`,
        `Tidspunkt: ${new Date().toISOString()}`
      ].join("\n")
    },
    {
      host: body.smtpHost.trim(),
      port: smtpPort,
      secure: Boolean(body.smtpSecure),
      user: typeof body.smtpUser === "string" ? body.smtpUser.trim() : null,
      pass: typeof body.smtpPass === "string" ? body.smtpPass.trim() : null,
      from: body.smtpFrom.trim(),
      replyTo: typeof body.smtpReplyTo === "string" ? body.smtpReplyTo.trim() : null
    }
  );

  return NextResponse.json({ sent: true, to });
}
