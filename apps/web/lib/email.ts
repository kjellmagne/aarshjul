import nodemailer from "nodemailer";

export type ReminderEmailPayload = {
  to: string;
  subject: string;
  text: string;
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string | null;
  pass?: string | null;
  from: string;
  replyTo?: string | null;
};

type SmtpConfigInput = {
  host?: string | null;
  port?: number | string | null;
  secure?: boolean;
  user?: string | null;
  pass?: string | null;
  from?: string | null;
  replyTo?: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizePort(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    if (!/^\d+$/.test(normalized)) {
      return null;
    }
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
      return parsed;
    }
  }
  return null;
}

function normalizeSmtpConfig(input: SmtpConfigInput | null | undefined): SmtpConfig | null {
  if (!input) {
    return null;
  }

  const host = normalizeText(input.host);
  const port = normalizePort(input.port);
  const from = normalizeText(input.from);
  if (!host || !port || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: Boolean(input.secure),
    user: normalizeText(input.user ?? null),
    pass: normalizeText(input.pass ?? null),
    from,
    replyTo: normalizeText(input.replyTo ?? null)
  };
}

function resolveEnvSmtpConfig(): SmtpConfig | null {
  return normalizeSmtpConfig({
    host: process.env.SMTP_HOST ?? null,
    port: process.env.SMTP_PORT ?? null,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER ?? null,
    pass: process.env.SMTP_PASS ?? null,
    from: process.env.SMTP_FROM ?? null,
    replyTo: process.env.SMTP_REPLY_TO ?? null
  });
}

async function sendViaSmtp(payload: ReminderEmailPayload, smtp: SmtpConfig) {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth:
      smtp.user && smtp.pass
        ? {
            user: smtp.user,
            pass: smtp.pass
          }
        : undefined
  });

  await transporter.sendMail({
    from: smtp.from,
    replyTo: smtp.replyTo ?? undefined,
    to: payload.to,
    subject: payload.subject,
    text: payload.text
  });
}

export async function sendEmailWithSmtp(payload: ReminderEmailPayload, smtpInput: SmtpConfigInput) {
  const smtp = normalizeSmtpConfig(smtpInput);
  if (!smtp) {
    throw new Error("SMTP configuration incomplete. Host, port, and from address are required.");
  }

  await sendViaSmtp(payload, smtp);
}

export async function sendReminderEmail(payload: ReminderEmailPayload, smtpInput?: SmtpConfigInput | null) {
  const smtp = normalizeSmtpConfig(smtpInput) ?? resolveEnvSmtpConfig();
  if (!smtp) {
    console.info("[reminder-email:mock]", payload);
    return { mocked: true };
  }

  await sendViaSmtp(payload, smtp);
  return { mocked: false };
}
