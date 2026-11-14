package betterauth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/roomies/backend/internal/config"
	"github.com/roomies/backend/internal/database"
)

func TestLocalAccountsWorkWithoutExternalAuthority(t *testing.T) {
	db, err := database.Connect("sqlite://:memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.RunMigrations(db); err != nil {
		t.Fatal(err)
	}
	client, err := NewLocalClient(db, &config.Config{PublicBaseURL: "http://localhost:8080"})
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	request := httptest.NewRequest(http.MethodPost, "/", nil)
	response, err := client.Do(ctx, http.MethodPost, "/sign-up/email", strings.NewReader(`{"name":"Local User","email":"local@example.test","password":"local-password-123"}`), request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("register status: %d", response.StatusCode)
	}
	var result struct {
		Token string `json:"token"`
	}
	err = json.NewDecoder(response.Body).Decode(&result)
	response.Body.Close()
	if err != nil || result.Token == "" {
		t.Fatalf("missing session: %v", err)
	}
	request.Header.Set("Authorization", "Bearer "+result.Token)
	session, err := client.GetSession(ctx, request)
	if err != nil || session == nil || session.User.Email != "local@example.test" {
		t.Fatalf("local session: %v, %v", session, err)
	}
	response, err = client.Do(ctx, http.MethodPost, "/sign-out", strings.NewReader(`{}`), request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	session, err = client.GetSession(ctx, request)
	if err != nil || session != nil {
		t.Fatalf("logout did not revoke session: %v, %v", session, err)
	}
	for _, tc := range []struct {
		password string
		status   int
	}{{"wrong-password", http.StatusUnauthorized}, {"local-password-123", http.StatusOK}} {
		response, err = client.Do(ctx, http.MethodPost, "/sign-in/email", strings.NewReader(`{"email":"local@example.test","password":"`+tc.password+`"}`), request)
		if err != nil {
			t.Fatal(err)
		}
		response.Body.Close()
		if response.StatusCode != tc.status {
			t.Fatalf("login status: got %d, want %d", response.StatusCode, tc.status)
		}
	}
}
