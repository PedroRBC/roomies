# Roomies

Roomies helps roommates manage shared expenses, notes, balances, and house-scoped household workflows.

- **Apps:** web, Android, Windows, Linux (Flutter); alternative web client (Vite + React, shadcn/ui, Tailwind CSS)
- **Server:** Go API + worker with integrated authentication, PostgreSQL, behind Caddy
- **Sign-in:** local Better Auth-compatible authentication

You only need Docker (Podman works too); no clone of this repo.

## Self-hosting

**1. Save this as `compose.yaml`:**

```yaml
name: roomies

x-backend: &backend
  image: ghcr.io/jobucaldas/roomies-backend:nightly
  environment:
    DATABASE_URL: postgres://roomies:${POSTGRES_PASSWORD}@db:5432/roomies?sslmode=verify-full&sslrootcert=/tls/ca.crt
    APP_ENV: production
    ROOMIES_PUBLIC_BASE_URL: ${ROOMIES_PUBLIC_BASE_URL:?set ROOMIES_PUBLIC_BASE_URL in .env}
    CORS_ALLOWED_ORIGINS: ${ROOMIES_PUBLIC_BASE_URL}
    TLS_CERT_FILE: /tls/backend.crt
    TLS_KEY_FILE: /tls/backend.key
    BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET:?set BETTER_AUTH_SECRET in .env}
    ROOMIES_AUTH_MODE: ${ROOMIES_AUTH_MODE:-local}
  volumes:
    - tls:/tls:ro
  depends_on:
    db:
      condition: service_healthy
  restart: unless-stopped

services:
  # One-shot: issues the private CA and certificates that encrypt traffic
  # between the containers below. Runs as root only to set key ownership.
  tls:
    image: ghcr.io/jobucaldas/roomies-backend:nightly
    command: ["tls-init"]
    user: "0"
    volumes:
      - tls:/tls

  db:
    image: postgres:16-alpine
    command: ["postgres", "-c", "ssl=on", "-c", "ssl_cert_file=/tls/db.crt", "-c", "ssl_key_file=/tls/db.key",
      "-c", "ssl_min_protocol_version=TLSv1.2", "-c", "hba_file=/tls/pg_hba.conf"]
    environment:
      POSTGRES_USER: roomies
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: roomies
    volumes:
      - pgdata:/var/lib/postgresql/data
      - tls:/tls:ro
    depends_on:
      tls:
        condition: service_completed_successfully
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U roomies -d roomies"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  backend:
    <<: *backend
    command: ["serve"]
    healthcheck:
      test: ["CMD", "wget", "-q", "--no-check-certificate", "-O", "/dev/null", "https://127.0.0.1:8080/readyz"]
      interval: 5s
      timeout: 5s
      retries: 20

  worker:
    <<: *backend
    command: ["worker"]

  web:
    image: ghcr.io/jobucaldas/roomies-frontend:nightly
    environment:
      SITE_ADDRESS: ${SITE_ADDRESS:-:8080}
    ports:
      - "${HTTP_PORT:-8080}:8080"
      # Automatic HTTPS on your own domain: set SITE_ADDRESS=roomies.example.com
      # in .env and publish these two instead of the line above.
      # - "80:80"
      # - "443:443"
    volumes:
      - caddy:/data
      - tls:/tls:ro
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

volumes:
  pgdata:
  caddy:
  tls:
```

**2. Save this as `.env` next to it** (keep it private):

```sh
POSTGRES_PASSWORD=          # openssl rand -hex 24
BETTER_AUTH_SECRET=          # openssl rand -hex 48
ROOMIES_PUBLIC_BASE_URL=https://roomies.example.com   # or http://localhost:8080 to try it
# SITE_ADDRESS=roomies.example.com                    # see the comment in compose.yaml
```

**3. Start it:**

```sh
docker compose up -d
curl -i http://localhost:8080/api/auth/me   # 401 means it is up
```

Open `ROOMIES_PUBLIC_BASE_URL`. With `APP_ENV: production` the server refuses to start unless that URL is `https://` (or `localhost`), so put it behind `SITE_ADDRESS` or your own TLS proxy. Update with `docker compose pull && docker compose up -d`; pin `:nightly` to a `YYYYMMDDHHMMSS_<shortsha>` tag to stay on a fixed version. Data lives in the `pgdata` volume.

Optional backend variables (email invitations, Web Push, FCM) are listed with comments in [`.env.example`](.env.example); add the ones you set to the `x-backend` environment.

**Encryption in transit.** Browsers and apps reach Caddy over HTTPS when `SITE_ADDRESS` is a domain (HSTS is sent). Between containers, `tls-init` issues a private CA (kept across restarts, key readable by root only): Caddy reaches the single Go API and all server services reach PostgreSQL over TLS with certificate checks; PostgreSQL rejects plaintext TCP connections. Invitation email requires STARTTLS or TLS (`SMTP_TLS`). Using an external PostgreSQL? Point `DATABASE_URL` at it with `sslmode=verify-full` (plus `sslrootcert=` for a private CA); production refuses any weaker mode, since only `verify-full` checks the server's certificate and hostname.

**Authentication.** The published Docker setup runs local authentication inside the Roomies server. Start the stack with Docker Compose, choose Create an account, and sign in with your email and password. Authentication runs in the same server and database as Roomies; no external identity service or authentication credentials are required. Local authentication is the default even when unused external provider credentials exist in the environment.

When upgrading, database migrations preserve existing local users and household memberships. Existing sessions end; sign in again with the local account.

## Apps

CI builds the Android APK, Windows bundle and Linux AppImage on every push as workflow artifacts. The native apps ask for your server's address on first launch. The web app is served by your server.

Android release signing on `main` uses these repository secrets when present: `ANDROID_KEYSTORE_BASE64` (`base64 -w0 upload-keystore.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Otherwise APKs use debug keys. Locally, put the same values in `src/app/android/key.properties` (gitignored).

## Development

Everything runs through Docker Compose; no Go or Flutter install needed. The root `docker-compose.yml` builds **your checkout**, unlike the compose file above, which runs the published images.

```sh
docker compose up --build    # optional: cp .env.example .env first
```

Open <http://localhost:8080/> and sign up with any email and password. This starts Postgres, Better Auth, the Go API and worker (`go run` on the mounted `src/server/`), and `web`, which builds the Flutter web app from `src/app/` and serves it with Caddy next to the API. Change the port with `HTTP_PORT` and a matching `ROOMIES_PUBLIC_BASE_URL`. Stop with `docker compose down` (`-v` also wipes the database).

| Changed | Do |
|---|---|
| `src/server/` | `docker compose restart backend worker` |
| `src/app/` | `docker compose up --build -d web` |

### Alternative web client

The Vite + React client in `src/web/` uses shadcn/ui components and Tailwind CSS v4. It connects to the same Go API through Caddy and uses HttpOnly cookie sessions. It uses local authentication for sign-in, invitations, house switching and administration, expense splits and privacy, balances and settlement suggestions, notes, groceries, chores, calendar, notification preferences, scheduled reminders, and browser Web Push. The React client has three workspaces: Today (agenda, an editable shopping list, quick task panels and house notes), Money (a compact expense ledger, balances, and optional daily/category/six-month spending charts), and Household (shopping, chores, calendar and the noticeboard). Small actions open alongside the current workspace; members, notifications and account settings use side panels. Chore, event and note creation forms expand on request. The agenda expands calendar and enabled chore recurrences for the next 31 days, includes events in progress, excludes completed chore occurrences, and shows the first six entries alongside upcoming reminders. Financial charts default to shared expenses and offer a separate scope for expenses visible to the current member, with accessible data tables. Today refreshes every minute while visible and when the window regains focus. Balance suggestions cover all shared expenses; payments are not recorded. Settings include English, Portuguese and Spanish, display currency, appearance, mint or plum accent, and a default house. Currency settings change formatting; they do not convert amounts.

Select the alternative on the same origin and port as Flutter (only one can use that port):

```sh
docker compose stop web
docker compose up --build -d web-vite
```

Open <http://localhost:8080/> (or your configured `HTTP_PORT`). To switch back:

```sh
docker compose stop web-vite
docker compose up --build -d web
```

For React development with hot reload, use the same origin and port instead of either built client:

```sh
docker compose stop web web-vite
docker compose up --build -d web-dev
```

Open <http://localhost:8080/> (or your configured `HTTP_PORT`). Edits under `src/web/` reload automatically; restart `web-dev` after dependency or Vite configuration changes. The Vite proxy verifies the API certificate against the local CA. Stop `web-dev` before switching back to `web` or `web-vite`.

The alternative is built locally; the published self-hosting image above continues to serve Flutter.

The dashboard can create bounded daily, weekly, or monthly reminders using the existing server worker. Notification delivery requires member preferences and configured channels; the daily digest groups notifications rather than generating a financial report. `GET /api/houses/{id}/agenda` requires house membership and returns up to 200 calendar/chore occurrences with an explicit truncation flag. `GET /api/houses/{id}/chore-completions?from=YYYY-MM-DD&to=YYYY-MM-DD` requires house membership, uses an inclusive `from` and exclusive `to` in UTC, and accepts up to 366 days.

House sections support deep links: `/house/{id}?tab=expenses` (also `notes`, `groceries`, `chores`, `calendar`, `balances`, `notifications`, and `members`). Invitations use `/accept-invitation?token=...`; `/dashboard?create=1` opens house creation. Browser push requires HTTPS or localhost, notification permission, and configured server Web Push keys. Neither client moves money when suggesting settlements.

Checks and tools:

```sh
docker compose run --rm test-backend    # gofmt, vet, tests (SQLite + Postgres)
docker compose run --rm test-frontend   # flutter analyze + test
docker compose run --build --rm --no-deps test-web  # Vite lint, unit/component tests, production build
docker compose run --rm apk             # debug APK -> src/app/build/app/outputs/flutter-apk/
```

Windows and Linux builds need their own OS: `flutter build windows|linux --release` inside `src/app/`.

| Path | Role |
|---|---|
| `src/server/` | Go API and worker. `Dockerfile`: `dev` stage (toolchain used by compose) and the production image |
| `src/app/` | Flutter app. `Dockerfile`: `local` builds the web bundle from source, `prebuilt` (default, what CI publishes) copies `build/web`; both serve it with Caddy and proxy `/api/*` (`SITE_ADDRESS`, `BACKEND_UPSTREAM`) |
| `src/web/` | Alternative Vite + React web client; shadcn/ui components, Tailwind CSS v4. `web-vite` serves it through Caddy; `test-web` runs its checks |
| `src/app/lib/` | `app/`: composition, routing and state; `core/`: API, storage and common utilities; `shared/`: widgets, theme and translations; `features/`: product flows. `test/` mirrors these folders |
| `docker-compose.yml` | Development stack and tooling |
| `.env.example` | Every config variable, with comments |
| `.github/workflows/ci.yml` | Checks on every push; on `main`, publishes `ghcr.io/jobucaldas/roomies-backend` and `roomies-frontend` as `:nightly` and `YYYYMMDDHHMMSS_<shortsha>` |

## Security
Report vulnerabilities privately; see [SECURITY.md](SECURITY.md).

## License
[GPL-3.0](LICENSE).
