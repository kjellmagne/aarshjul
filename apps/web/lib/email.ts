import nodemailer from "nodemailer";

export type ReminderEmailPayload = {
  to: string;
  subject: string;
  text: string;
};

function smtpEnabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
}

export async function sendReminderEmail(payload: ReminderEmailPayload) {
  if (!smtpEnabled()) {
    console.info("[reminder-email:mock]", payload);
    return { mocked: true };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number.parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        : undefined
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: payload.to,
    subject: payload.subject,
    text: payload.text
  });

  return { mocked: false };
}
