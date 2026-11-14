import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { bearer } from "better-auth/plugins/bearer";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { compare } from "bcryptjs";
import type { Pool } from "pg";

interface Config {
  publicURL: string;
  secret: string;
  google?: { clientId: string; clientSecret: string };
}
const developmentSecret =
  "roomies-local-development-secret-change-before-hosting";
export function readConfig(env: NodeJS.ProcessEnv): Config {
  const publicURL = env.ROOMIES_PUBLIC_BASE_URL || "http://localhost:8080";
  const url = new URL(publicURL);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.origin !== publicURL ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
  ) {
    throw new Error(
      "ROOMIES_PUBLIC_BASE_URL must be an HTTPS origin (HTTP is allowed on localhost)",
    );
  }
  const secret = env.BETTER_AUTH_SECRET || (loopback ? developmentSecret : "");
  if (secret.length < 32 || (!loopback && secret === developmentSecret)) {
    throw new Error(
      "BETTER_AUTH_SECRET must contain at least 32 characters; generate one with openssl rand -hex 48",
    );
  }
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!!clientId !== !!clientSecret)
    throw new Error("Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  return {
    publicURL,
    secret,
    google: clientId && clientSecret ? { clientId, clientSecret } : undefined,
  };
}

export function createRoomiesAuth(database: Pool, config: Config) {
  const factor = twoFactor({
    issuer: "Roomies",
    allowPasswordless: true,
    twoFactorTable: "auth_two_factor",
    schema: { user: { fields: { twoFactorEnabled: "two_factor_enabled" } } },
  });
  const gate = factor.hooks.after[0];
  const credentialMatcher = gate.matcher;
  // The Go callback forwards the challenge cookies and renders the second-factor form.
  gate.matcher = (ctx) =>
    credentialMatcher(ctx) || ctx.path === "/callback/:id";
  const auth = betterAuth({
    appName: "Roomies",
    baseURL: config.publicURL,
    secret: config.secret,
    database,
    trustedOrigins: [config.publicURL],
    socialProviders: config.google
      ? { google: { ...config.google, prompt: "select_account" } }
      : {},
    onAPIError: { errorURL: `${config.publicURL}/api/auth/google/finish` },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      password: {
        hash: hashPassword,
        verify: async ({ hash, password }) => {
          // Existing Go accounts use bcrypt; new accounts use Better Auth's scrypt.
          if (/^\$2[aby]\$/.test(hash)) {
            if (Buffer.byteLength(password) > 72) return false;
            return compare(password, hash);
          }
          return verifyPassword({ hash, password });
        },
      },
    },
    user: {
      modelName: "users",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      additionalFields: {
        passwordHash: {
          type: "string",
          fieldName: "password_hash",
          required: false,
          defaultValue: "",
          input: false,
          returned: false,
        },
      },
    },
    session: {
      modelName: "auth_session",
      expiresIn: 8 * 60 * 60,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_account", accountLinking: { enabled: false } },
    verification: { modelName: "auth_verification" },
    advanced: {
      cookiePrefix: "roomies_auth",
      cookies: {
        session_token: { name: "roomies_session" },
        two_factor: { name: "roomies_two_factor" },
        oauth_state: { name: "roomies_oauth_state" },
      },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 40,
      customRules: { "/get-session": false, "/sign-out": false },
    },
    plugins: [factor, bearer()],
    telemetry: { enabled: false },
  });
  const allowed = new Set([
    "/api/auth/sign-up/email",
    "/api/auth/sign-in/email",
    "/api/auth/get-session",
    "/api/auth/sign-out",
    "/api/auth/ok",
    "/api/auth/sign-in/social",
    "/api/auth/callback/google",
    "/api/auth/two-factor/enable",
    "/api/auth/two-factor/disable",
    "/api/auth/two-factor/verify-totp",
    "/api/auth/two-factor/verify-backup-code",
  ]);
  return {
    handler: (request: Request) =>
      new URL(request.url).pathname === "/api/auth/roomies-config"
        ? Promise.resolve(Response.json({ google: !!config.google }))
        : allowed.has(new URL(request.url).pathname)
          ? auth.handler(request)
          : Promise.resolve(new Response(null, { status: 404 })),
  };
}
