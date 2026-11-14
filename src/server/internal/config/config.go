package config

import (
	"encoding/base64"
	"errors"
	"net"
	"net/mail"
	"net/url"
	"os"
	"strconv"
	"strings"
)

// SMTP transport security modes for SMTP_TLS.
const (
	SMTPTLSStartTLS = "starttls" // plain connection upgraded with STARTTLS; refuses servers without it
	SMTPTLSImplicit = "tls"      // TLS from the first byte (usually port 465)
	SMTPTLSNone     = "none"     // no encryption; only for a local test sink such as Mailpit
)

type Config struct {
	Port                        string
	WorkerHealthPort            string
	DatabaseURL                 string
	Environment                 string
	CORSAllowedOrigins          []string
	PublicBaseURL               string
	InvitationTTL               int
	JobPollInterval             int
	JobLeaseSeconds             int
	SMTPHost                    string
	SMTPPort                    int
	SMTPUsername                string
	SMTPPassword                string
	SMTPFrom                    string
	SMTPTLS                     string
	TLSCertFile                 string
	TLSKeyFile                  string
	InvitationDeliveryKeyID     string
	InvitationDeliveryKey       string
	InvitationDeliveryOldKeys   string
	NotificationDeliveryKeyID   string
	NotificationDeliveryKey     string
	NotificationDeliveryOldKeys string
	WebPushPublicKey            string
	WebPushPrivateKey           string
	WebPushSubject              string
	FCMProjectID                string
	FCMCredentialsFile          string
	BetterAuthSecret            string
	GoogleClientID              string
	GoogleClientSecret          string
	CaldasAuthURL               string
	CaldasClientID              string
	CaldasClientSecret          string
	CaldasRedirectURL           string
	// Deprecated compatibility fields; authentication is now hosted by Go.
	AuthURL    string
	AuthCAFile string
}

func Load() *Config {
	return &Config{
		Port:                        getEnv("PORT", "8080"),
		WorkerHealthPort:            getEnv("WORKER_HEALTH_PORT", "8081"),
		DatabaseURL:                 getEnv("DATABASE_URL", "sqlite://roomies.db"),
		Environment:                 strings.ToLower(getEnv("APP_ENV", "development")),
		CORSAllowedOrigins:          splitCSV(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:8081")),
		PublicBaseURL:               strings.TrimRight(getEnv("ROOMIES_PUBLIC_BASE_URL", "http://localhost:8080"), "/"),
		InvitationTTL:               getEnvInt("INVITATION_TTL_HOURS", 168),
		JobPollInterval:             getEnvInt("JOB_POLL_INTERVAL_SECONDS", 2),
		JobLeaseSeconds:             getEnvInt("JOB_LEASE_SECONDS", 30),
		SMTPHost:                    strings.TrimSpace(os.Getenv("SMTP_HOST")),
		SMTPPort:                    getEnvInt("SMTP_PORT", 1025),
		SMTPUsername:                os.Getenv("SMTP_USERNAME"),
		SMTPPassword:                os.Getenv("SMTP_PASSWORD"),
		SMTPFrom:                    getEnv("SMTP_FROM", "Roomies <no-reply@roomies.local>"),
		SMTPTLS:                     strings.ToLower(getEnv("SMTP_TLS", SMTPTLSStartTLS)),
		TLSCertFile:                 strings.TrimSpace(os.Getenv("TLS_CERT_FILE")),
		TLSKeyFile:                  strings.TrimSpace(os.Getenv("TLS_KEY_FILE")),
		InvitationDeliveryKeyID:     strings.TrimSpace(os.Getenv("INVITATION_DELIVERY_KEY_ID")),
		InvitationDeliveryKey:       strings.TrimSpace(os.Getenv("INVITATION_DELIVERY_KEY")),
		InvitationDeliveryOldKeys:   strings.TrimSpace(os.Getenv("INVITATION_DELIVERY_OLD_KEYS")),
		NotificationDeliveryKeyID:   strings.TrimSpace(os.Getenv("NOTIFICATION_DELIVERY_KEY_ID")),
		NotificationDeliveryKey:     strings.TrimSpace(os.Getenv("NOTIFICATION_DELIVERY_KEY")),
		NotificationDeliveryOldKeys: strings.TrimSpace(os.Getenv("NOTIFICATION_DELIVERY_OLD_KEYS")),
		WebPushPublicKey:            strings.TrimSpace(os.Getenv("WEB_PUSH_PUBLIC_KEY")),
		WebPushPrivateKey:           strings.TrimSpace(os.Getenv("WEB_PUSH_PRIVATE_KEY")),
		WebPushSubject:              getEnv("WEB_PUSH_SUBJECT", "mailto:no-reply@roomies.local"),
		FCMProjectID:                strings.TrimSpace(os.Getenv("FCM_PROJECT_ID")),
		FCMCredentialsFile:          strings.TrimSpace(os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")),
		BetterAuthSecret:            strings.TrimSpace(os.Getenv("BETTER_AUTH_SECRET")),
		GoogleClientID:              strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID")),
		GoogleClientSecret:          strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET")),
		CaldasAuthURL:               strings.TrimRight(strings.TrimSpace(os.Getenv("CALDAS_AUTH_URL")), "/"),
		CaldasClientID:              strings.TrimSpace(os.Getenv("CALDAS_CLIENT_ID")),
		CaldasClientSecret:          strings.TrimSpace(os.Getenv("CALDAS_CLIENT_SECRET")),
		CaldasRedirectURL:           strings.TrimSpace(os.Getenv("CALDAS_REDIRECT_URL")),
	}
}

func (c *Config) Validate() error {
	if c.AuthURL != "" {
		u, err := url.Parse(c.AuthURL)
		if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(u.Scheme == "http" && isLoopbackHost(u.Hostname()))) {
			return errors.New("AUTH_URL must use https except on localhost and contain only an origin")
		}
	}
	if (c.GoogleClientID == "") != (c.GoogleClientSecret == "") {
		return errors.New("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be provided together")
	}
	if (c.CaldasAuthURL == "") != (c.CaldasClientID == "") || (c.CaldasClientID == "") != (c.CaldasClientSecret == "") {
		return errors.New("CALDAS_AUTH_URL, CALDAS_CLIENT_ID, and CALDAS_CLIENT_SECRET must be provided together")
	}
	if c.CaldasAuthURL != "" {
		u, err := url.Parse(c.CaldasAuthURL)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
			return errors.New("CALDAS_AUTH_URL must be an https origin")
		}
	}
	if c.Environment == "production" {
		for _, origin := range c.CORSAllowedOrigins {
			if origin == "*" {
				return errors.New("wildcard CORS origin is not allowed in production")
			}
		}
		// Sessions, passwords, and household data must not cross a network in
		// clear text; only a loopback origin (trying it on one machine) is exempt.
		if !strings.HasPrefix(strings.ToLower(c.PublicBaseURL), "https://") && !isLoopbackURL(c.PublicBaseURL) {
			return errors.New("production ROOMIES_PUBLIC_BASE_URL must use https unless it is a localhost URL")
		}
		if unverifiedPostgresURL(c.DatabaseURL) {
			return errors.New("production DATABASE_URL must use sslmode=verify-full (add sslrootcert for a private CA) so the server's certificate and hostname are checked")
		}
	}
	if (c.TLSCertFile == "") != (c.TLSKeyFile == "") {
		return errors.New("TLS_CERT_FILE and TLS_KEY_FILE must be provided together")
	}
	if len(c.CORSAllowedOrigins) == 0 {
		return errors.New("at least one CORS_ALLOWED_ORIGINS value is required")
	}
	if c.Port == "" {
		return errors.New("PORT is required")
	}
	if c.WorkerHealthPort == "" {
		return errors.New("WORKER_HEALTH_PORT is required")
	}
	if c.PublicBaseURL == "" {
		return errors.New("ROOMIES_PUBLIC_BASE_URL is required")
	}
	publicURL, err := url.Parse(c.PublicBaseURL)
	if err != nil || (publicURL.Scheme != "http" && publicURL.Scheme != "https") || publicURL.Host == "" || publicURL.User != nil || publicURL.Path != "" && publicURL.Path != "/" || publicURL.RawQuery != "" || publicURL.Fragment != "" {
		return errors.New("ROOMIES_PUBLIC_BASE_URL must be an absolute http(s) origin without path, credentials, query, or fragment")
	}
	if c.InvitationTTL <= 0 {
		return errors.New("INVITATION_TTL_HOURS must be positive")
	}
	if c.JobPollInterval <= 0 {
		return errors.New("JOB_POLL_INTERVAL_SECONDS must be positive")
	}
	if c.JobLeaseSeconds <= 0 {
		return errors.New("JOB_LEASE_SECONDS must be positive")
	}
	if c.SMTPHost != "" && (c.SMTPPort <= 0 || c.SMTPPort > 65535) {
		return errors.New("SMTP_PORT must be between 1 and 65535")
	}
	if (c.SMTPUsername == "") != (c.SMTPPassword == "") {
		return errors.New("SMTP_USERNAME and SMTP_PASSWORD must be provided together")
	}
	if c.SMTPHost == "" && c.SMTPUsername != "" {
		return errors.New("SMTP_HOST is required when SMTP credentials are configured")
	}
	pushConfigured := c.WebPushPublicKey != "" || c.WebPushPrivateKey != "" || c.FCMProjectID != ""
	if (c.WebPushPublicKey == "") != (c.WebPushPrivateKey == "") {
		return errors.New("WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY must be provided together")
	}
	if pushConfigured {
		if c.NotificationDeliveryKeyID == "" || c.NotificationDeliveryKey == "" {
			return errors.New("NOTIFICATION_DELIVERY_KEY_ID and NOTIFICATION_DELIVERY_KEY are required when push delivery is configured")
		}
		key, err := base64.StdEncoding.DecodeString(c.NotificationDeliveryKey)
		if err != nil || len(key) != 32 {
			return errors.New("NOTIFICATION_DELIVERY_KEY must be a base64-encoded 32-byte AES-256 key")
		}
	}
	if c.SMTPHost != "" {
		if c.InvitationDeliveryKeyID == "" || c.InvitationDeliveryKey == "" {
			return errors.New("INVITATION_DELIVERY_KEY_ID and INVITATION_DELIVERY_KEY are required when SMTP_HOST is configured")
		}
		key, err := base64.StdEncoding.DecodeString(c.InvitationDeliveryKey)
		if err != nil || len(key) != 32 {
			return errors.New("INVITATION_DELIVERY_KEY must be a base64-encoded 32-byte AES-256 key")
		}
		if c.SMTPFrom == "" {
			return errors.New("SMTP_FROM is required when SMTP_HOST is configured")
		}
		address, err := mail.ParseAddress(c.SMTPFrom)
		if err != nil || address.Address == "" {
			return errors.New("SMTP_FROM must be a valid email address")
		}
		switch c.SMTPTLS {
		case "", SMTPTLSStartTLS, SMTPTLSImplicit:
		case SMTPTLSNone:
			if c.Environment == "production" && !isLoopbackHost(c.SMTPHost) {
				return errors.New("SMTP_TLS=none is only allowed for a localhost SMTP server in production")
			}
		default:
			return errors.New("SMTP_TLS must be starttls, tls, or none")
		}
	}
	return nil
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return fallback
	}
	return parsed
}

func isLoopbackURL(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return isLoopbackHost(u.Hostname())
}

func isLoopbackHost(host string) bool {
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// unverifiedPostgresURL reports a PostgreSQL URL that would connect without
// checking the server certificate and hostname (anything but verify-full,
// including a missing sslmode, which the database package treats as require).
func unverifiedPostgresURL(raw string) bool {
	if !strings.HasPrefix(raw, "postgres://") && !strings.HasPrefix(raw, "postgresql://") {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return true
	}
	return !strings.EqualFold(u.Query().Get("sslmode"), "verify-full")
}
