import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
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
