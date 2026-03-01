const ADMIN_EMAIL_SEPARATOR = /[,;\s]+/;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set();
  }
  return new Set(raw.split(ADMIN_EMAIL_SEPARATOR).map(normalizeEmail).filter(Boolean));
}

export function isBootstrapAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const admins = parseAdminEmails(process.env.ADMIN_EMAILS);
  return admins.has(normalizeEmail(email));
}

export function isBootstrapSystemAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  const admins = parseAdminEmails(process.env.SYSTEM_ADMIN_EMAILS);
  return admins.has(normalizeEmail(email));
}
