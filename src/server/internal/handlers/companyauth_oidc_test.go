package handlers

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/roomies/backend/internal/betterauth"
	"github.com/roomies/backend/internal/config"
	"github.com/roomies/backend/internal/database"
	"github.com/roomies/backend/internal/repository"
)

func TestCompanyOIDCFlow(t *testing.T) {
	for _, scenario := range []string{"success", "success_native", "missing_id_token", "wrong_signature", "wrong_issuer", "wrong_audience", "expired", "wrong_nonce", "missing_subject", "missing_email", "state_mismatch", "expired_state", "cancelled", "exchange_failed", "local_email_conflict", "userinfo_wrong_subject", "userinfo_unavailable", "userinfo_malformed"} {
		t.Run(scenario, func(t *testing.T) {
			publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
			if err != nil {
				t.Fatal(err)
			}
			db, err := database.Connect("sqlite://:memory:")
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if err := database.RunMigrations(db); err != nil {
				t.Fatal(err)
			}
			var issuer, nonce, challenge string
			tokenCalls := 0
			provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				switch r.URL.Path {
				case "/api/auth/.well-known/openid-configuration":
					json.NewEncoder(w).Encode(map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/oauth2/authorize", "token_endpoint": issuer + "/oauth2/token", "jwks_uri": issuer + "/jwks", "userinfo_endpoint": issuer + "/oauth2/userinfo", "id_token_signing_alg_values_supported": []string{"EdDSA"}})
				case "/api/auth/jwks":
					json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]any{"kty": "OKP", "crv": "Ed25519", "kid": "test-key", "alg": "EdDSA", "use": "sig", "x": base64.RawURLEncoding.EncodeToString(publicKey)}}})
				case "/api/auth/oauth2/userinfo":
					if r.Header.Get("Authorization") != "Bearer access-token" {
						t.Error("userinfo must use the access token")
						http.Error(w, "unauthorized", 401)
						return
					}
					if scenario == "userinfo_unavailable" {
						http.Error(w, "unavailable", 503)
						return
					}
					if scenario == "userinfo_malformed" {
						w.Write([]byte(`{`))
						return
					}
					profile := map[string]any{"sub": "central-user", "name": "Central User", "email": "central@example.test", "email_verified": true}
					if scenario == "missing_email" {
						delete(profile, "email")
					}
					if scenario == "userinfo_wrong_subject" {
						profile["sub"] = "different-user"
					}
					json.NewEncoder(w).Encode(profile)
				case "/api/auth/oauth2/token":
					tokenCalls++
					client, secret, ok := r.BasicAuth()
					if !ok || client != "client" || secret != "secret" {
						t.Error("token exchange must use client_secret_basic")
						http.Error(w, "bad client", 401)
						return
					}
					if err := r.ParseForm(); err != nil {
						t.Fatal(err)
					}
					if r.Form.Get("redirect_uri") != "http://localhost:8080/api/auth/callback/caldas" || r.Form.Get("code") != "test-code" || r.Form.Get("grant_type") != "authorization_code" {
						t.Error("invalid code exchange")
					}
					if pkceChallenge(r.Form.Get("code_verifier")) != challenge {
						t.Error("invalid PKCE verifier")
					}
					if scenario == "exchange_failed" {
						http.Error(w, `{"error":"invalid_grant"}`, 400)
						return
					}
					claims := jwt.MapClaims{"iss": issuer, "aud": "client", "sub": "central-user", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": nonce}
					switch scenario {
					case "wrong_nonce":
						claims["nonce"] = "other"
					case "wrong_audience":
						claims["aud"] = "other"
					case "wrong_issuer":
						claims["iss"] = "https://other.example"
					case "expired":
						claims["exp"] = time.Now().Add(-time.Hour).Unix()
					case "missing_subject":
						delete(claims, "sub")
					case "missing_email":
						delete(claims, "email")
					}
					signingKey := privateKey
					if scenario == "wrong_signature" {
						_, signingKey, _ = ed25519.GenerateKey(rand.Reader)
					}
					signed := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
					signed.Header["kid"] = "test-key"
					raw, err := signed.SignedString(signingKey)
					if err != nil {
						t.Fatal(err)
					}
					body := map[string]any{"access_token": "access-token", "token_type": "Bearer", "expires_in": 3600, "id_token": raw}
					if scenario == "missing_id_token" {
						delete(body, "id_token")
					}
					json.NewEncoder(w).Encode(body)
				default:
					t.Errorf("unexpected provider request: %s", r.URL.Path)
					http.NotFound(w, r)
				}
			}))
			defer provider.Close()
			issuer = provider.URL + "/api/auth"
			cfg := &config.Config{AuthMode: "companyauth", CaldasAuthURL: provider.URL, CaldasClientID: "client", CaldasClientSecret: "secret", PublicBaseURL: "http://localhost:8080"}
			auth, err := betterauth.NewLocalClient(db, cfg)
			if err != nil {
				t.Fatal(err)
			}
			users := repository.NewUserRepository(db)
			if scenario == "local_email_conflict" {
				_, err = db.Exec(`INSERT INTO users (id,name,email,password_hash) VALUES ('local-user','Local','central@example.test','local-hash')`)
				if err != nil {
					t.Fatal(err)
				}
			}
			h := NewAuthHandler(users, auth, cfg.PublicBaseURL, cfg)
			loginURL := "/api/auth/login"
			var flow struct {
				ID       string `json:"id"`
				Verifier string `json:"verifier"`
				URL      string `json:"url"`
			}
			if scenario == "success_native" {
				startNative := httptest.NewRecorder()
				h.NativeStart(startNative, httptest.NewRequest("POST", "/api/auth/native/start", strings.NewReader(`{}`)))
				if startNative.Code != 200 {
					t.Fatalf("native start: %d", startNative.Code)
				}
				if err := json.Unmarshal(startNative.Body.Bytes(), &flow); err != nil {
					t.Fatal(err)
				}
				loginURL = flow.URL
				if !strings.Contains(loginURL, "/api/auth/login?native=") {
					t.Fatal("native flow used the wrong authority")
				}
			}
			start := httptest.NewRecorder()
			h.Login(start, httptest.NewRequest("GET", loginURL, nil))
			if start.Code != 302 {
				t.Fatalf("login start: %d %s", start.Code, start.Body.String())
			}
			location, err := url.Parse(start.Header().Get("Location"))
			if err != nil {
				t.Fatal(err)
			}
			query := location.Query()
			state := query.Get("state")
			nonce = query.Get("nonce")
			challenge = query.Get("code_challenge")
			if nonce == "" || state == "" || challenge == "" || query.Get("code_challenge_method") != "S256" || query.Get("response_type") != "code" {
				t.Fatal("missing OIDC protections")
			}
			var cookie *http.Cookie
			for _, c := range start.Result().Cookies() {
				if c.Name == "roomies_auth_state" {
					cookie = c
				}
			}
			if cookie == nil {
				t.Fatal("missing state cookie")
			}
			if !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode {
				t.Fatal("insecure state cookie")
			}
			if scenario == "expired_state" {
				entry := h.company.states[state]
				entry.expires = time.Now().Add(-time.Hour)
				h.company.states[state] = entry
			}
			callbackURL := "/api/auth/callback/caldas?code=test-code&state=" + url.QueryEscape(state)
			if scenario == "state_mismatch" {
				cookie.Value = "other"
			}
			if scenario == "cancelled" {
				callbackURL += "&error=access_denied"
			}
			callback := httptest.NewRequest("GET", callbackURL, nil)
			callback.AddCookie(cookie)
			result := httptest.NewRecorder()
			h.CompanyCallback(result, callback)
			if scenario == "success" || scenario == "success_native" {
				if result.Code != 303 {
					t.Fatalf("callback: %d %s", result.Code, result.Body.String())
				}
				sessionRequest := httptest.NewRequest("GET", "/", nil)
				for _, c := range result.Result().Cookies() {
					if c.MaxAge >= 0 {
						sessionRequest.AddCookie(c)
					}
				}
				session, err := auth.GetSession(context.Background(), sessionRequest)
				if err != nil || session == nil || session.User.Email != "central@example.test" {
					t.Fatalf("missing local session: %v %v", session, err)
				}
				var hash, sub string
				if err := db.QueryRow(`SELECT password_hash,auth_sub FROM users WHERE id=$1`, session.User.ID).Scan(&hash, &sub); err != nil {
					t.Fatal(err)
				}
				if hash != "" || sub != "central-user" {
					t.Fatal("central identity stored incorrectly")
				}
				replay := httptest.NewRecorder()
				h.CompanyCallback(replay, callback)
				if replay.Code != 400 || tokenCalls != 1 {
					t.Fatal("callback replay was accepted")
				}
				if scenario == "success_native" {
					if result.Header().Get("Location") != "/api/auth/google/finish" {
						t.Fatal("missing native confirmation redirect")
					}
					confirm := httptest.NewRequest("POST", "/api/auth/google/finish", strings.NewReader("step=confirm"))
					confirm.Header.Set("Content-Type", "application/x-www-form-urlencoded")
					confirm.Header.Set("Origin", cfg.PublicBaseURL)
					for _, c := range sessionRequest.Cookies() {
						confirm.AddCookie(c)
					}
					for _, c := range start.Result().Cookies() {
						if c.Name == "roomies_native" {
							confirm.AddCookie(c)
						}
					}
					confirmed := httptest.NewRecorder()
					h.GoogleFinish(confirmed, confirm)
					if confirmed.Code != 200 || !strings.Contains(confirmed.Body.String(), "You can return to Roomies now.") {
						t.Fatalf("native confirmation failed: %d %s", confirmed.Code, confirmed.Body.String())
					}
					pollBody, _ := json.Marshal(map[string]string{"id": flow.ID, "verifier": flow.Verifier})
					poll := httptest.NewRecorder()
					h.NativePoll(poll, httptest.NewRequest("POST", "/api/auth/native/poll", strings.NewReader(string(pollBody))))
					if poll.Code != 200 || !strings.Contains(poll.Body.String(), `"token"`) {
						t.Fatalf("native poll failed: %d %s", poll.Code, poll.Body.String())
					}
					again := httptest.NewRecorder()
					h.NativePoll(again, httptest.NewRequest("POST", "/api/auth/native/poll", strings.NewReader(string(pollBody))))
					if again.Code != 400 {
						t.Fatal("native handoff reused")
					}
				}
				logout := httptest.NewRecorder()
				h.Logout(logout, sessionRequest)
				session, err = auth.GetSession(context.Background(), sessionRequest)
				if logout.Code != 204 || err != nil || session != nil {
					t.Fatal("logout failed to revoke central login's local session")
				}
			} else {
				if result.Code >= 200 && result.Code < 400 && scenario != "cancelled" {
					t.Fatalf("accepted invalid identity: %d %s", result.Code, result.Body.String())
				}
				for _, c := range result.Result().Cookies() {
					if strings.Contains(c.Name, "session") && c.Value != "" {
						t.Fatal("failed login issued a session")
					}
				}
				var count int
				if err := db.QueryRow(`SELECT COUNT(*) FROM auth_session`).Scan(&count); err != nil {
					t.Fatal(err)
				}
				if count != 0 {
					t.Fatal("failed login persisted a session")
				}
				if scenario == "local_email_conflict" {
					var sub string
					if err := db.QueryRow(`SELECT COALESCE(auth_sub,'') FROM users WHERE id='local-user'`).Scan(&sub); err != nil {
						t.Fatal(err)
					}
					if sub != "" {
						t.Fatal("local account was silently linked")
					}
				}
			}
		})
	}
}
