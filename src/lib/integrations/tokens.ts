// Gives a working access token for a connected account, refreshing it when it is about to
// expire and saving the new (encrypted) details. Marks the account as needing reconnection
// if access has been removed.
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { ProviderError } from "./http";
import { refreshTokens, type ConnectionKind, type ProviderId } from "./oauth";

type AccountRow = { id: string; provider: "GOOGLE" | "MICROSOFT"; accessTokenEnc: string | null; refreshTokenEnc: string | null; tokenExpiresAt: Date | null };

export const providerOf = (p: "GOOGLE" | "MICROSOFT"): ProviderId => (p === "GOOGLE" ? "google" : "microsoft");

export async function accessTokenFor(kind: ConnectionKind, account: AccountRow, now = new Date()): Promise<string> {
  const stillGood = account.accessTokenEnc && account.tokenExpiresAt && account.tokenExpiresAt.getTime() - now.getTime() > 2 * 60_000;
  if (stillGood) return decrypt(account.accessTokenEnc!);
  if (!account.refreshTokenEnc) throw new ProviderError("auth", "No refresh token saved.");

  const fresh = await refreshTokens(providerOf(account.provider), decrypt(account.refreshTokenEnc), kind);
  const data = {
    accessTokenEnc: encrypt(fresh.accessToken),
    // Microsoft sends a new refresh token each time; Google usually keeps the old one.
    ...(fresh.refreshToken ? { refreshTokenEnc: encrypt(fresh.refreshToken) } : {}),
    tokenExpiresAt: fresh.expiresAt,
  };
  if (kind === "email") await prisma.emailAccount.update({ where: { id: account.id }, data });
  else await prisma.calendarAccount.update({ where: { id: account.id }, data });
  return fresh.accessToken;
}
