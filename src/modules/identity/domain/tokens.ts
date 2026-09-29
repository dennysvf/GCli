import { createHash, randomBytes } from "node:crypto";

// Invitation tokens: 32 random bytes sent by email; only the SHA-256 hash is stored.
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
