package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/roomies/backend/internal/models"
)

func TestNativeGoogleHandoffRequiresConfirmationVerifierAndSingleUse(t *testing.T) {
	env := newTestEnv(t)
	defer env.Cleanup()
	user := &models.User{ID: models.NewID(), Name: "Native", Email: "native-google@example.test"}
	if err := env.UserRepo.Create(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/auth/sign-in/social":
			http.SetCookie(w, &http.Cookie{Name: "roomies_oauth_state", Value: "state", HttpOnly: true})
			json.NewEncoder(w).Encode(map[string]string{"url": "https://accounts.google.com/o/oauth2/v2/auth?state=state"})
		case "/api/auth/get-session":
			cookie, err := r.Cookie("roomies_session")
			if err != nil || cookie.Value != "native-token" {
				json.NewEncoder(w).Encode(nil)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"user": user, "session": map[string]string{"id": "session-id", "token": "native-token"}})
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	env.Authority.BaseURL = upstream.URL
	call := func(method, path, body string, cookies []*http.Cookie, origin string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		if strings.Contains(path, "finish") && method == "POST" {
			r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		} else {
			r.Header.Set("Content-Type", "application/json")
		}
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		for _, c := range cookies {
			r.AddCookie(c)
		}
		w := httptest.NewRecorder()
		env.Router.ServeHTTP(w, r)
		return w
	}
	start := call("POST", "/api/auth/native/start", "{}", nil, "")
	var flow map[string]string
	json.Unmarshal(start.Body.Bytes(), &flow)
	if start.Code != 200 || len(flow["verifier"]) < 40 || strings.Contains(flow["url"], flow["verifier"]) {
		t.Fatalf("insecure start: %d", start.Code)
	}
	poll := func(verifier string) *httptest.ResponseRecorder {
		body, _ := json.Marshal(map[string]string{"id": flow["id"], "verifier": verifier})
		return call("POST", "/api/auth/native/poll", string(body), nil, "")
	}
	if poll(flow["verifier"]).Code != 202 {
		t.Fatal("must remain pending before browser confirmation")
	}
	if poll("wrong").Code != 400 {
		t.Fatal("accepted wrong verifier")
	}
	browser := call("GET", "/api/auth/google?native="+flow["id"], "", nil, "")
	cookies := browser.Result().Cookies()
	cookies = append(cookies, &http.Cookie{Name: "roomies_session", Value: "native-token"})
	if browser.Code != 303 {
		t.Fatal(browser.Body.String())
	}
	page := call("GET", "/api/auth/google/finish", "", cookies, "")
	if page.Code != 200 || !strings.Contains(page.Body.String(), user.Email) || strings.Contains(page.Body.String(), "native-token") {
		t.Fatal("confirmation page missing or exposes session token")
	}
	if poll(flow["verifier"]).Code != 202 {
		t.Fatal("GET completed handoff")
	}
	for _, origin := range []string{"", "https://evil.test"} {
		if call("POST", "/api/auth/google/finish", "step=confirm", cookies, origin).Code != 403 {
			t.Fatal("accepted untrusted confirmation")
		}
	}
	confirm := call("POST", "/api/auth/google/finish", "step=confirm", cookies, env.Config.PublicBaseURL)
	if confirm.Code != 200 {
		t.Fatal(confirm.Body.String())
	}
	complete := poll(flow["verifier"])
	var session models.AuthResponse
	json.NewDecoder(bytes.NewReader(complete.Body.Bytes())).Decode(&session)
	if complete.Code != 200 || session.Token != "native-token" || session.User.ID != user.ID {
		t.Fatalf("handoff failed: %d %s", complete.Code, complete.Body)
	}
	if poll(flow["verifier"]).Code != 400 {
		t.Fatal("handoff replay accepted")
	}
}

func TestTwoFactorProxyKeepsChallengeAndRotatedTokensOutOfWebBodies(t *testing.T) {
	env := newTestEnv(t)
	defer env.Cleanup()
	user := &models.User{ID: models.NewID(), Name: "Factor", Email: "factor@example.test"}
	if err := env.UserRepo.Create(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/auth/sign-in/email":
			http.SetCookie(w, &http.Cookie{Name: "__Secure-roomies_two_factor", Value: "signed-challenge", HttpOnly: true, Secure: true, Path: "/", MaxAge: 600})
			json.NewEncoder(w).Encode(map[string]bool{"twoFactorRedirect": true})
		case "/api/auth/two-factor/verify-totp":
			c, err := r.Cookie("__Secure-roomies_two_factor")
			if err != nil || c.Value != "signed-challenge" {
				w.WriteHeader(401)
				return
			}
			http.SetCookie(w, &http.Cookie{Name: "__Secure-roomies_session", Value: "rotated-token", HttpOnly: true, Secure: true, Path: "/"})
			w.Header().Set("set-auth-token", "rotated-token")
			json.NewEncoder(w).Encode(models.AuthResponse{Token: "old-token", User: *user})
		default:
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	env.Authority.BaseURL = upstream.URL
	for _, web := range []bool{true, false} {
		login := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"email":"factor@example.test","password":"password123"}`))
		if web {
			login.Header.Set("X-Roomies-Client", "web")
		}
		w := httptest.NewRecorder()
		env.Router.ServeHTTP(w, login)
		var body map[string]any
		json.Unmarshal(w.Body.Bytes(), &body)
		if w.Code != 200 || body["two_factor_required"] != true || body["token"] != nil || body["user"] != nil {
			t.Fatalf("challenge: %d %s", w.Code, w.Body)
		}
		if web && body["challenge"] != nil {
			t.Fatal("web challenge exposed")
		}
		verify := httptest.NewRequest("POST", "/api/auth/two-factor/verify-totp", strings.NewReader(`{"code":"123456","challenge":"signed-challenge"}`))
		if web {
			verify.Header.Set("X-Roomies-Client", "web")
			for _, c := range w.Result().Cookies() {
				verify.AddCookie(c)
			}
		}
		result := httptest.NewRecorder()
		env.Router.ServeHTTP(result, verify)
		body = nil
		json.Unmarshal(result.Body.Bytes(), &body)
		if result.Code != 200 || body["user"] == nil {
			t.Fatalf("verification: %d %s", result.Code, result.Body)
		}
		if web && (body["token"] != nil || result.Header().Get("set-auth-token") != "") {
			t.Fatal("token leaked to page script")
		}
		if !web && body["token"] != "rotated-token" {
			t.Fatal("native did not receive rotated session")
		}
	}
}

func TestRecentSignInCanDisableAfterUsingFinalRecoveryCode(t *testing.T) {
	env := newTestEnv(t)
	defer env.Cleanup()
	createdAt := time.Now()
	disabled := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/auth/get-session":
			json.NewEncoder(w).Encode(map[string]any{"user": map[string]string{"id": "user", "email": "recovered@example.test"}, "session": map[string]any{"id": "session-id", "token": "last-code-session", "createdAt": createdAt}})
		case "/api/auth/two-factor/disable":
			disabled = true
			json.NewEncoder(w).Encode(map[string]bool{"status": true})
		default:
			t.Errorf("unexpected call %s", r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer upstream.Close()
	env.Authority.BaseURL = upstream.URL
	call := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "/api/auth/two-factor/disable", strings.NewReader(`{"password":"password123"}`))
		r.Header.Set("Authorization", "Bearer last-code-session")
		w := httptest.NewRecorder()
		env.Router.ServeHTTP(w, r)
		return w
	}
	if w := call(); w.Code != 200 || !disabled {
		t.Fatalf("recent recovery failed: %d %s", w.Code, w.Body)
	}
	disabled = false
	createdAt = time.Now().Add(-10 * time.Minute)
	if w := call(); w.Code != 403 || disabled {
		t.Fatalf("old session bypassed step-up: %d %s", w.Code, w.Body)
	}
}
