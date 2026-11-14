# syntax=docker/dockerfile:1
FROM docker.io/library/node:24-alpine AS tools
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
CMD ["sh", "-c", "npm run lint && npm test && npm run build"]

FROM tools AS build
RUN npm run build

FROM docker.io/library/caddy:2.8-alpine AS runtime
COPY <<'CADDYFILE' /etc/caddy/Caddyfile
{
	# Accept X-Forwarded-* from a TLS-terminating proxy on a private network.
	servers {
		trusted_proxies static private_ranges
	}
}

{$SITE_ADDRESS::8080} {
	encode gzip

	header {
		# Ignored by browsers over plain HTTP, so it is safe for localhost trials.
		Strict-Transport-Security "max-age=31536000"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
		Referrer-Policy "no-referrer"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'"
	}

	handle /api/* {
		reverse_proxy {$BACKEND_UPSTREAM:backend:8080} {
			# The API only speaks TLS; trust the private CA from `tls-init`.
			transport http {
				tls
				tls_trusted_ca_certs {$BACKEND_CA_FILE:/tls/ca.crt}
			}
			header_up X-Forwarded-For {remote_host}
			header_up X-Forwarded-Host {host}
		}
	}

	# SPA fallback so deep links and refreshes serve the web shell.
	handle {
		root * /app/dist
		header Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}
}
CADDYFILE
RUN adduser -D -H -u 65532 -g nonroot nonroot \
  && mkdir -p /app/dist /data /config \
  && chown -R 65532:65532 /data /config
USER 65532:65532
EXPOSE 8080

FROM runtime AS local
COPY --from=build /app/dist/ /app/dist/
