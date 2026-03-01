import { createHash, randomBytes } from "crypto";

import { ApiKeyScope } from "@prisma/client";

export type GeneratedApiKey = {
  value: string;
  prefix: string;
  hash: string;
};

export function hashApiKey(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateApiKey(scope: ApiKeyScope): GeneratedApiKey {
  const prefix = randomBytes(5).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const scopeTag = scope === ApiKeyScope.SYSTEM ? "sys" : "ten";
  const value = `ak_${scopeTag}_${prefix}_${secret}`;
  const hash = hashApiKey(value);
  return { value, prefix, hash };
}
