package config

import (
	"encoding/base64"
	"testing"
)

func testDeliveryKey() string { return base64.StdEncoding.EncodeToString(make([]byte, 32)) }

func TestConfigValidatesSMTPSettings(t *testing.T) {
	config := &Config{
		Environment:             "production",
		CORSAllowedOrigins:      []string{"https://roomies.example"},
		Port:                    "8080",
		WorkerHealthPort:        "8081",
		PublicBaseURL:           "https://roomies.example",
		InvitationTTL:           168,
		JobPollInterval:         2,
		JobLeaseSeconds:         30,
		SMTPPort:                587,
		SMTPHost:                "smtp.example.com",
		SMTPFrom:                "Roomies <sender@example.com>",
		InvitationDeliveryKeyID: "test-key",
		InvitationDeliveryKey:   testDeliveryKey(),
	}
	if err := config.Validate(); err != nil {
		t.Fatalf("expected valid SMTP settings: %v", err)
	}
	config.SMTPUsername = "user"
	if err := config.Validate(); err == nil {
		t.Fatal("expected username without password to be rejected")
	}
}

func TestConfigRequiresDedicatedNotificationKeyForPush(t *testing.T) {
	config := &Config{Environment: "test", CORSAllowedOrigins: []string{"http://localhost"}, Port: "8080", WorkerHealthPort: "8081", PublicBaseURL: "http://localhost", InvitationTTL: 168, JobPollInterval: 2, JobLeaseSeconds: 30, WebPushPublicKey: "public", WebPushPrivateKey: "private"}
	if err := config.Validate(); err == nil {
		t.Fatal("expected encryption key to be required")
	}
	config.NotificationDeliveryKeyID = "notification-v1"
	config.NotificationDeliveryKey = testDeliveryKey()
	if err := config.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestAuthURLRequiresVerifiedTransport(t *testing.T) {
	c := &Config{AuthURL: "https://auth:3000", Environment: "development", CORSAllowedOrigins: []string{"http://localhost:8080"}, Port: "8080", WorkerHealthPort: "8081", PublicBaseURL: "http://localhost:8080", InvitationTTL: 168, JobPollInterval: 2, JobLeaseSeconds: 30}
	for _, raw := range []string{"https://auth:3000", "http://localhost:3000"} {
		c.AuthURL = raw
		if err := c.Validate(); err != nil {
			t.Fatalf("rejected valid authority %s: %v", raw, err)
		}
	}
	for _, raw := range []string{"http://auth:3000", "https://user:pass@auth:3000", "https://auth:3000/path", "https://auth:3000?redirect=evil", "https://auth:3000#fragment"} {
		c.AuthURL = raw
		if err := c.Validate(); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
}

func TestProductionConfigRequiresEncryptedTransport(t *testing.T) {
	base := func() *Config {
		return &Config{
			Environment:        "production",
			CORSAllowedOrigins: []string{"https://roomies.example"},
			Port:               "8080",
			WorkerHealthPort:   "8081",
			DatabaseURL:        "postgres://roomies:pw@db:5432/roomies?sslmode=verify-full&sslrootcert=/tls/ca.crt",
			PublicBaseURL:      "https://roomies.example",
			InvitationTTL:      168,
			JobPollInterval:    2,
			JobLeaseSeconds:    30,
		}
	}
	if err := base().Validate(); err != nil {
		t.Fatalf("expected TLS configuration to validate: %v", err)
	}
	for name, mutate := range map[string]func(*Config){
		"wildcard CORS":           func(c *Config) { c.CORSAllowedOrigins = []string{"*"} },
		"http public origin":      func(c *Config) { c.PublicBaseURL = "http://roomies.example" },
		"plaintext database":      func(c *Config) { c.DatabaseURL = "postgres://roomies:pw@db:5432/roomies?sslmode=disable" },
		"opportunistic database":  func(c *Config) { c.DatabaseURL = "postgresql://roomies:pw@db/roomies?sslmode=prefer" },
		"unverified database":     func(c *Config) { c.DatabaseURL = "postgres://roomies:pw@db/roomies?sslmode=require" },
		"default database mode":   func(c *Config) { c.DatabaseURL = "postgres://roomies:pw@db/roomies" },
		"cert without key":        func(c *Config) { c.TLSCertFile = "/tls/backend.crt" },
		"smtp without encryption": func(c *Config) { c.SMTPHost = "smtp.example"; c.SMTPTLS = SMTPTLSNone },
	} {
		t.Run(name, func(t *testing.T) {
			c := base()
			c.SMTPPort = 587
			c.SMTPFrom = "sender@example.test"
			c.InvitationDeliveryKeyID = "k"
			c.InvitationDeliveryKey = testDeliveryKey()
			mutate(c)
			if err := c.Validate(); err == nil {
				t.Fatal("expected configuration to be rejected")
			}
		})
	}
	loopback := base()
	loopback.PublicBaseURL = "http://localhost:8080"
	if err := loopback.Validate(); err != nil {
		t.Fatalf("expected loopback trial origin to validate: %v", err)
	}
}
