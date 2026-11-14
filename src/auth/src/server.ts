import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { toNodeHandler } from "better-auth/node";
import { createRoomiesAuth, readConfig } from "./auth.ts";

const config = readConfig(process.env);
const connection = new URL(
  process.env.DATABASE_URL || "postgres://roomies:roomies@db:5432/roomies",
);
// Configure pg TLS explicitly: sslmode URL parsing otherwise replaces the custom CA.
for (const key of ["sslmode", "sslrootcert"])
  connection.searchParams.delete(key);
const pool = new Pool({
  connectionString: connection.href,
  ssl: {
    ca: readFileSync(process.env.DATABASE_CA_FILE || "/tls/ca.crt", "utf8"),
    rejectUnauthorized: true,
  },
});
await pool.query("SELECT 1 FROM auth_account LIMIT 1");
const auth = createRoomiesAuth(pool, config);
const server = createServer(
  {
    cert: readFileSync(process.env.TLS_CERT_FILE || "/tls/backend.crt"),
    key: readFileSync(process.env.TLS_KEY_FILE || "/tls/backend.key"),
    minVersion: "TLSv1.2",
  },
  toNodeHandler(auth),
);
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log("Roomies authentication ready"),
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => void pool.end()));
}
