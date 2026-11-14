import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHmac, generateKeyPairSync, sign, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { hash } from "bcryptjs";
import { createRoomiesAuth, readConfig } from "./auth.ts";

const connectionString = process.env.AUTH_TEST_DATABASE_URL;
assert.ok(
  connectionString,
  "AUTH_TEST_DATABASE_URL must point at a migrated test database",
);
const admin = new Pool({ connectionString });
const schema = `auth_test_${randomUUID().replaceAll("-", "")}`;
const pool = new Pool({
  connectionString,
  options: `-c search_path=${schema}`,
});
const origin = "https://roomies.example.test";
const auth = createRoomiesAuth(pool, {
  publicURL: origin,
  secret: "test-only-secret-that-is-at-least-32-characters",
});
let nextIP = 1;
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  for (const table of [
    "users",
    "auth_account",
    "auth_session",
    "auth_verification",
    "auth_two_factor",
  ]) {
    await admin.query(
      `CREATE TABLE ${schema}.${table} (LIKE public.${table} INCLUDING ALL)`,
    );
  }
});
after(async () => {
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});
function request(
  path: string,
  body?: object,
  headers: Record<string, string> = {},
) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Forwarded-For": `198.51.100.${nextIP++}`,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}

test("registers without email verification, authenticates cookies and native bearer, revokes on logout", async () => {
  const email = `new-${randomUUID()}@example.test`;
  const response = await request("/sign-up/email", {
    email,
    name: "Alex",
    password: "a-good-password",
  });
  assert.equal(response.status, 200, await response.clone().text());
  const { user, token } = await response.json();
  assert.equal(user.emailVerified, false);
  assert.equal(user.passwordHash, undefined);
  assert.ok(token);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("__Secure-roomies_session="));
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Secure/i);
  assert.match(cookie, /SameSite=Lax/i);
  const session = await request("/get-session", undefined, {
    Cookie: cookie.split(";")[0],
  });
  assert.equal((await session.json()).user.id, user.id);
  const bearer = { Authorization: `Bearer ${token}` };
  assert.equal(
    (await (await request("/get-session", undefined, bearer)).json()).user.id,
    user.id,
  );
  assert.equal((await request("/sign-out", {}, bearer)).status, 200);
  assert.equal(
    await (await request("/get-session", undefined, bearer)).json(),
    null,
  );
  const login = await request("/sign-in/email", {
    email,
    password: "a-good-password",
  });
  assert.equal(login.status, 200, await login.clone().text());
  assert.equal((await login.json()).user.id, user.id);
});

test("accepts existing Go bcrypt hashes without changing the user's ID", async () => {
  const id = randomUUID(),
    email = `legacy-${id}@example.test`,
    password = "original-password";
  await pool.query(
    `INSERT INTO users(id,name,email,password_hash) VALUES($1,'Legacy',$2,'')`,
    [id, email],
  );
  await pool.query(
    `INSERT INTO auth_account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$1,'credential',$1,$2,NOW(),NOW())`,
    [id, await hash(password, 10)],
  );
  const response = await request("/sign-in/email", { email, password });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).user.id, id);
});

test("rejects bad passwords, forged tokens, duplicate registration and foreign origins", async () => {
  const email = `safe-${randomUUID()}@example.test`;
  await request("/sign-up/email", {
    email,
    name: "Safe",
    password: "password123",
  });
  assert.equal(
    (await request("/sign-in/email", { email, password: "wrong-password" }))
      .status,
    401,
  );
  assert.equal(
    await (
      await request("/get-session", undefined, {
        Authorization: "Bearer forged",
      })
    ).json(),
    null,
  );
  assert.equal(
    (
      await request("/sign-up/email", {
        email,
        name: "Other",
        password: "password123",
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await request(
        "/sign-in/email",
        { email, password: "password123" },
        { Origin: "https://evil.test" },
      )
    ).status,
    403,
  );
});

test("does not expose verification or password recovery endpoints", async () => {
  for (const path of [
    "/request-password-reset",
    "/send-verification-email",
    "/reset-password",
  ]) {
    assert.equal(
      (await request(path, { email: "someone@example.test" })).status,
      404,
    );
  }
});

test("rejects insecure public configuration and weak production secrets", () => {
  assert.throws(() =>
    readConfig({
      ROOMIES_PUBLIC_BASE_URL: "http://public.example",
      BETTER_AUTH_SECRET: "a".repeat(48),
    }),
  );
  assert.throws(() =>
    readConfig({
      ROOMIES_PUBLIC_BASE_URL: origin,
      BETTER_AUTH_SECRET: "short",
    }),
  );
  assert.throws(() =>
    readConfig({
      ROOMIES_PUBLIC_BASE_URL: `${origin}/path`,
      BETTER_AUTH_SECRET: "a".repeat(48),
    }),
  );
  assert.equal(
    readConfig({ ROOMIES_PUBLIC_BASE_URL: "http://localhost:8080" }).publicURL,
    "http://localhost:8080",
  );
});

test("limits repeated password guesses from the same IP", async () => {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await request(
      "/sign-in/email",
      { email: "unknown@example.test", password: "wrong-password" },
      { "X-Forwarded-For": "203.0.113.10" },
    );
  }
  assert.equal(response?.status, 429);
});

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
function totp(uri: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...new URL(uri).searchParams.get("secret")!]
    .map((c) => alphabet.indexOf(c).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest();
  return ((hash.readUInt32BE(hash[19] & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}

test("TOTP enrollment requires confirmation; sign-in has no session until a valid second factor; backup codes are single-use", async () => {
  const email = `totp-${randomUUID()}@example.test`,
    password = "a-good-password";
  const signup = await request("/sign-up/email", {
    email,
    password,
    name: "TOTP",
  });
  const session = { Cookie: cookies(signup) };
  assert.equal(
    (await request("/two-factor/enable", { password: "incorrect" }, session))
      .status,
    400,
  );
  const setupResponse = await request(
    "/two-factor/enable",
    { password, method: "totp" },
    session,
  );
  assert.equal(setupResponse.status, 200, await setupResponse.clone().text());
  const setup = await setupResponse.json();
  assert.match(setup.totpURI, /^otpauth:\/\/totp\//);
  assert.ok(setup.backupCodes.length);
  assert.equal(
    (await (await request("/get-session", undefined, session)).json()).user
      .twoFactorEnabled,
    false,
  );
  const confirmed = await request(
    "/two-factor/verify-totp",
    { code: totp(setup.totpURI) },
    session,
  );
  assert.equal(confirmed.status, 200, await confirmed.clone().text());
  const enabledSession = { Cookie: cookies(confirmed) };
  assert.equal(
    (await (await request("/get-session", undefined, enabledSession)).json())
      .user.twoFactorEnabled,
    true,
  );
  await request("/sign-out", {}, enabledSession);
  async function challenge() {
    const response = await request("/sign-in/email", { email, password });
    const result = await response.json();
    assert.equal(result.twoFactorRedirect, true);
    assert.equal(result.token, undefined);
    assert.equal(response.headers.get("set-auth-token"), null);
    const headers = { Cookie: cookies(response) };
    assert.equal(
      await (await request("/get-session", undefined, headers)).json(),
      null,
    );
    return headers;
  }
  const pending = await challenge();
  assert.equal(
    (await request("/two-factor/verify-totp", { code: "invalid" }, pending))
      .status,
    401,
  );
  const verified = await request(
    "/two-factor/verify-totp",
    { code: totp(setup.totpURI) },
    pending,
  );
  assert.equal(verified.status, 200, await verified.clone().text());
  assert.ok((await verified.json()).token);
  assert.equal(
    (
      await request(
        "/two-factor/verify-totp",
        { code: totp(setup.totpURI) },
        pending,
      )
    ).status,
    401,
  );
  const backup = await request(
    "/two-factor/verify-backup-code",
    { code: setup.backupCodes[0] },
    await challenge(),
  );
  assert.equal(backup.status, 200, await backup.clone().text());
  assert.equal(
    (
      await request(
        "/two-factor/verify-backup-code",
        { code: setup.backupCodes[0] },
        await challenge(),
      )
    ).status,
    401,
  );
  const disabled = await request(
    "/two-factor/disable",
    { password },
    { Cookie: cookies(backup) },
  );
  assert.equal(disabled.status, 200, await disabled.clone().text());
  assert.ok(
    (await (await request("/sign-in/email", { email, password })).json()).token,
  );
});

test("Google OAuth validates state, keeps local accounts separate, and enforces TOTP before issuing a session", async () => {
  const googleAuth = createRoomiesAuth(pool, {
    publicURL: origin,
    secret: "test-only-secret-that-is-at-least-32-characters",
    google: {
      clientId: "google-test-client",
      clientSecret: "google-test-secret",
    },
  });
  const send = (path: string, body?: object, cookie = "") =>
    googleAuth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          Cookie: cookie,
          "X-Forwarded-For": `192.0.2.${nextIP++}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const kid = randomUUID();
  let email = `google-${randomUUID()}@example.test`;
  const sub = randomUUID();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      const now = Math.floor(Date.now() / 1000);
      const header = Buffer.from(
        JSON.stringify({ alg: "RS256", typ: "JWT", kid }),
      ).toString("base64url");
      const claims = Buffer.from(
        JSON.stringify({
          iss: "https://accounts.google.com",
          aud: "google-test-client",
          sub,
          email,
          email_verified: true,
          name: "Google User",
          iat: now,
          exp: now + 300,
        }),
      ).toString("base64url");
      const payload = `${header}.${claims}`;
      const id_token = `${payload}.${sign("RSA-SHA256", Buffer.from(payload), privateKey).toString("base64url")}`;
      return Response.json({
        access_token: "test-google-access-token",
        token_type: "Bearer",
        expires_in: 300,
        id_token,
      });
    }
    if (url === "https://www.googleapis.com/oauth2/v3/certs")
      return Response.json({
        keys: [
          {
            ...publicKey.export({ format: "jwk" }),
            kid,
            alg: "RS256",
            use: "sig",
          },
        ],
      });
    return originalFetch(input, init);
  };
  try {
    async function oauth() {
      const start = await send("/sign-in/social", {
        provider: "google",
        callbackURL: `${origin}/api/auth/google/finish`,
      });
      assert.equal(start.status, 200, await start.clone().text());
      const target = new URL((await start.json()).url);
      assert.equal(target.origin, "https://accounts.google.com");
      assert.equal(
        target.searchParams.get("redirect_uri"),
        `${origin}/api/auth/callback/google`,
      );
      assert.ok(target.searchParams.get("code_challenge"));
      return {
        path: `/callback/google?code=test-code&state=${target.searchParams.get("state")}`,
        cookie: cookies(start),
      };
    }
    const initial = await oauth();
    const missingStateCookie = await send(initial.path);
    assert.equal(missingStateCookie.status, 302);
    assert.match(missingStateCookie.headers.get("location")!, /error=/);
    const first = await oauth();
    const signedIn = await send(first.path, undefined, first.cookie);
    assert.equal(signedIn.status, 302, await signedIn.clone().text());
    const sessionCookie = cookies(signedIn);
    const session = await (
      await send("/get-session", undefined, sessionCookie)
    ).json();
    assert.equal(session.user.email, email);
    const setupResponse = await send(
      "/two-factor/enable",
      { method: "totp" },
      sessionCookie,
    );
    assert.equal(setupResponse.status, 200, await setupResponse.clone().text());
    const setup = await setupResponse.json();
    const verified = await send(
      "/two-factor/verify-totp",
      { code: totp(setup.totpURI) },
      sessionCookie,
    );
    assert.equal(verified.status, 200, await verified.clone().text());
    await send("/sign-out", {}, cookies(verified));
    const second = await oauth();
    const gated = await send(second.path, undefined, second.cookie);
    assert.equal((await gated.json()).twoFactorRedirect, true);
    assert.equal(gated.headers.get("set-auth-token"), null);
    const challenge = cookies(gated);
    assert.equal(
      await (await send("/get-session", undefined, challenge)).json(),
      null,
    );
    const complete = await send(
      "/two-factor/verify-totp",
      { code: totp(setup.totpURI) },
      challenge,
    );
    assert.equal(complete.status, 200, await complete.clone().text());
    assert.equal((await complete.json()).user.id, session.user.id);
    email = `local-conflict-${randomUUID()}@example.test`;
    await request("/sign-up/email", {
      email,
      name: "Local",
      password: "password123",
    });
    // A distinct Google subject cannot implicitly take over a password account.
    await pool.query(
      'DELETE FROM auth_account WHERE "providerId" = \'google\' AND "userId" = $1',
      [session.user.id],
    );
    const conflict = await oauth();
    const rejected = await send(conflict.path, undefined, conflict.cookie);
    assert.match(rejected.headers.get("location")!, /error=/);
    assert.equal(
      await (await send("/get-session", undefined, cookies(rejected))).json(),
      null,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
