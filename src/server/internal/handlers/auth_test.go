package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWebRegisterKeepsTokenHttpOnly(t *testing.T) {
	env := newTestEnv(t)
	defer env.Cleanup()
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(`{"name":"Web","email":"web@example.test","password":"password123"}`))
	req.Header.Set("X-Roomies-Client", "web")
	req.Header.Set("Origin", env.Config.PublicBaseURL)
	w := httptest.NewRecorder()
	env.Router.ServeHTTP(w, req)
	if w.Code != 201 {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	var body map[string]any
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["token"] != nil || w.Header().Get("set-auth-token") != "" {
		t.Fatal("token exposed to page script")
	}
	me := httptest.NewRequest("GET", "/api/auth/me", nil)
	found := false
	for _, cookie := range w.Result().Cookies() {
		me.AddCookie(cookie)
		if cookie.Name == "roomies_session" {
			found = true
			if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode {
				t.Fatal("insecure session cookie")
			}
		}
	}
	if !found {
		t.Fatal("missing cookie")
	}
	result := httptest.NewRecorder()
	env.Router.ServeHTTP(result, me)
	if result.Code != 200 {
		t.Fatal(result.Body.String())
	}
}
func TestForeignOriginCannotCreateSession(t *testing.T) {
	env := newTestEnv(t)
	defer env.Cleanup()
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(`{"name":"Web","email":"web@example.test","password":"password123"}`))
	req.Header.Set("Origin", "https://evil.test")
	w := httptest.NewRecorder()
	env.Router.ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatalf("foreign origin accepted: %d", w.Code)
	}
}
func TestAuthenticationFailsClosedWhenAuthorityUnavailable(t *testing.T) {
	env := newTestEnv(t)
	defer env.Cleanup()
	token := registerUser(t, env.Router, "Outage", "outage@example.test", "password123")
	env.Authority.BaseURL = "http://127.0.0.1:1"
	for _, attempt := range []struct {
		method, path string
		body         any
	}{{"GET", "/api/auth/me", nil}, {"POST", "/api/auth/logout", nil}, {"POST", "/api/auth/login", map[string]string{"email": "outage@example.test", "password": "password123"}}} {
		w := authenticatedRequest(t, env.Router, attempt.method, attempt.path, token, attempt.body)
		if w.Code != 503 {
			t.Fatalf("%s: %d %s", attempt.path, w.Code, w.Body.String())
		}
	}
}
