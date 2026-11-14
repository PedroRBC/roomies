package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"golang.org/x/oauth2"

	"github.com/roomies/backend/internal/config"
	"github.com/roomies/backend/internal/middleware"
)

type companyAuth struct {
	cfg        *oauth2.Config
	issuer     string
	userinfo   string
	endSession string
	mu         sync.Mutex
	states     map[string]companyState
}
type companyState struct {
	verifier, returnTo string
	expires            time.Time
}

func newCompanyAuth(cfg *config.Config, publicURL string) (*companyAuth, error) {
	if cfg == nil || cfg.CaldasAuthURL == "" {
		return nil, nil
	}
	base := strings.TrimRight(cfg.CaldasAuthURL, "/")
	redirect := cfg.CaldasRedirectURL
	if redirect == "" {
		redirect = strings.TrimRight(publicURL, "/") + "/api/auth/callback/caldas"
	}
	return &companyAuth{
		cfg: &oauth2.Config{
			ClientID: cfg.CaldasClientID, ClientSecret: cfg.CaldasClientSecret,
			Endpoint:    oauth2.Endpoint{AuthURL: base + "/api/auth/oauth2/authorize", TokenURL: base + "/api/auth/oauth2/token", AuthStyle: oauth2.AuthStyleInHeader},
			RedirectURL: redirect, Scopes: []string{"openid", "profile", "email", "offline_access"},
		},
		issuer: base + "/api/auth", userinfo: base + "/api/auth/oauth2/userinfo", endSession: base + "/api/auth/oauth2/end-session",
		states: make(map[string]companyState),
	}, nil
}
func randomURLToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func pkceChallenge(verifier string) string {
	h := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(h[:])
}
func (h *AuthHandler) companyLogin(w http.ResponseWriter, r *http.Request) {
	if h.company == nil {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	state, verifier := randomURLToken(32), randomURLToken(32)
	if state == "" || verifier == "" {
		h.unavailable(w)
		return
	}
	returnTo := r.URL.Query().Get("return_to")
	if returnTo == "" || !strings.HasPrefix(returnTo, "/") || strings.HasPrefix(returnTo, "//") {
		returnTo = "/"
	}
	h.company.mu.Lock()
	h.company.states[state] = companyState{verifier: verifier, returnTo: returnTo, expires: time.Now().Add(10 * time.Minute)}
	h.company.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "roomies_auth_state", Value: state, Path: "/api/auth", MaxAge: 600, HttpOnly: true, Secure: h.secureCookie(r), SameSite: http.SameSiteLaxMode})
	authURL := h.company.cfg.AuthCodeURL(state, oauth2.SetAuthURLParam("code_challenge", pkceChallenge(verifier)), oauth2.SetAuthURLParam("code_challenge_method", "S256"))
	http.Redirect(w, r, authURL, http.StatusFound)
}
func (h *AuthHandler) CompanyCallback(w http.ResponseWriter, r *http.Request) {
	h.companyCallback(w, r)
}

func (h *AuthHandler) companyCallback(w http.ResponseWriter, r *http.Request) {
	if h.company == nil {
		http.Error(w, "CompanyAuth is not configured", 503)
		return
	}
	state := r.URL.Query().Get("state")
	if state == "" || r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, "/?auth_error=cancelled", 303)
		return
	}
	if c, err := r.Cookie("roomies_auth_state"); err != nil || c.Value != state {
		http.Error(w, "invalid authentication state", 400)
		return
	}
	h.company.mu.Lock()
	entry, ok := h.company.states[state]
	delete(h.company.states, state)
	h.company.mu.Unlock()
	if !ok || time.Now().After(entry.expires) {
		http.Error(w, "authentication state expired", 400)
		return
	}
	token, err := h.company.cfg.Exchange(r.Context(), r.URL.Query().Get("code"), oauth2.SetAuthURLParam("code_verifier", entry.verifier))
	if err != nil {
		http.Error(w, "authentication exchange failed", 502)
		return
	}
	req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, h.company.userinfo, nil)
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)
	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		if res != nil {
			res.Body.Close()
		}
		http.Error(w, "authentication profile unavailable", 502)
		return
	}
	defer res.Body.Close()
	var profile struct {
		Sub   string `json:"sub"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if json.NewDecoder(res.Body).Decode(&profile) != nil || profile.Sub == "" || profile.Email == "" {
		http.Error(w, "invalid authentication profile", 502)
		return
	}
	if profile.Name == "" {
		profile.Name = strings.Split(profile.Email, "@")[0]
	}
	user, err := h.userRepo.UpsertCompanyUser(r.Context(), profile.Sub, profile.Name, strings.ToLower(strings.TrimSpace(profile.Email)))
	if err != nil {
		h.unavailable(w)
		return
	}
	session, err := h.auth.CreateLocalSession(r.Context(), user.ID, r)
	if err != nil {
		h.unavailable(w)
		return
	}
	copyAuthCookies(w, session)
	setCookie(w, middleware.SessionHintCookieName, "1", 8*60*60, false, h.secureCookie(r))
	http.Redirect(w, r, entry.returnTo, 303)
}

// Keep the identity provider's logout endpoint available for clients that want global sign-out.
func (h *AuthHandler) companyLogoutURL(r *http.Request) string {
	if h.company == nil || h.company.endSession == "" {
		return ""
	}
	u, err := url.Parse(h.company.endSession)
	if err != nil {
		return ""
	}
	q := u.Query()
	q.Set("post_logout_redirect_uri", strings.TrimRight(h.publicBaseURL, "/")+"/")
	q.Set("client_id", h.company.cfg.ClientID)
	u.RawQuery = q.Encode()
	return u.String()
}
