package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/roomies/backend/internal/config"
)

func TestCompanyAuthRequiresExplicitMode(t *testing.T) {
	for _, mode := range []string{"", "local", "companyauth"} {
		t.Run(mode, func(t *testing.T) {
			cfg := &config.Config{AuthMode: mode, CaldasAuthURL: "https://auth.example.test", CaldasClientID: "client", CaldasClientSecret: "secret"}
			handler := NewAuthHandler(nil, nil, "http://localhost:8080", cfg)
			if got := handler.company != nil; got != (mode == "companyauth") {
				t.Fatalf("company auth enabled = %v for mode %q", got, mode)
			}
			if mode != "companyauth" {
				response := httptest.NewRecorder()
				handler.CompanyCallback(response, httptest.NewRequest(http.MethodGet, "/api/auth/callback/caldas?code=unused", nil))
				if response.Code != http.StatusServiceUnavailable {
					t.Fatalf("local mode accepted company callback: %d", response.Code)
				}
			}
		})
	}
}
