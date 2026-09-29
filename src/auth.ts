// Sign in with Google or Microsoft, using Auth.js.
import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { attachUserToOrganisation, decideSignIn } from "@/lib/organisation";
import { normaliseEmail, randomToken } from "@/lib/crypto";

export const devLoginEnabled =
  process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN_ENABLED === "true";

const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google);
}
if (process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
}

// Development only: sign in as an existing demo user without Google or Microsoft.
// Never available when the app runs in production.
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Demo user",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? normaliseEmail(credentials.email) : "";
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active || !user.organisationId) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  );
}

// Google and Microsoft sign in buttons. The development demo login is listed separately on the sign in page.
export const configuredProviders = providers
  .map((p) => (typeof p === "function" ? p() : p))
  .filter((cfg) => cfg.type === "oauth" || cfg.type === "oidc")
  .map((cfg) => ({ id: cfg.id, name: cfg.name }));

// Store and look up email addresses in lower case so invitations always match.
const baseAdapter = PrismaAdapter(prisma);
const adapter: typeof baseAdapter = {
  ...baseAdapter,
  createUser: (data) => baseAdapter.createUser!({ ...data, email: normaliseEmail(data.email) }),
  getUserByEmail: (email) => baseAdapter.getUserByEmail!(normaliseEmail(email)),
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  // Sign in state is kept in a secure, encrypted cookie. The user's role and access are
  // always read fresh from the database, so changes take effect straight away.
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers,
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "dev-login") return true;
      const email = user.email;
      if (!email) return "/signin?error=NoEmail";
      const decision = await decideSignIn(prisma, email);
      if (decision.allowed) return true;
      return `/signin?error=${decision.reason === "inactive" ? "Inactive" : "NotInvited"}`;
    },
    async jwt({ token, user, account }) {
      if (user?.id) {
        token.sub = user.id;
        // A fresh random id for each sign in. The server records when this sign in has passed
        // two step sign in, so the browser cannot claim it has.
        token.sid = randomToken(24);
        token.provider = account?.provider ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      const s = session as typeof session & { sid?: string; provider?: string | null };
      s.sid = typeof token.sid === "string" ? token.sid : undefined;
      s.provider = typeof token.provider === "string" ? token.provider : null;
      return s;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) await attachUserToOrganisation(prisma, user.id);
    },
  },
});
