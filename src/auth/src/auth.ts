import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { compare } from "bcryptjs";
import type { Pool } from "pg";

interface Config {
  publicURL: string;
  secret: string;
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
  return { publicURL, secret };
}

export function createRoomiesAuth(database: Pool, config: Config) {
  const auth = betterAuth({
    appName: "Roomies",
    baseURL: config.publicURL,
    secret: config.secret,
    database,
    trustedOrigins: [config.publicURL],
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
      cookies: { session_token: { name: "roomies_session" } },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 40,
      customRules: { "/get-session": false, "/sign-out": false },
    },
    plugins: [bearer()],
    telemetry: { enabled: false },
  });
  const allowed = new Set([
    "/api/auth/sign-up/email",
    "/api/auth/sign-in/email",
    "/api/auth/get-session",
    "/api/auth/sign-out",
    "/api/auth/ok",
  ]);
  return {
    handler: (request: Request) =>
      allowed.has(new URL(request.url).pathname)
        ? auth.handler(request)
        : Promise.resolve(new Response(null, { status: 404 })),
  };
}
