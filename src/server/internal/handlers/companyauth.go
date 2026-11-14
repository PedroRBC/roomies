package handlers

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/roomies/backend/internal/config"
	"github.com/roomies/backend/internal/middleware"
	"github.com/roomies/backend/internal/repository"
)

type companyAuth struct {
	cfg      oauth2.Config
	issuer   string
	http     *http.Client
	mu       sync.Mutex
	provider *oidc.Provider
	states   map[string]companyState
}
type companyState struct {
	verifier, nonce, returnTo string
	expires                   time.Time
}

func newCompanyAuth(cfg *config.Config, publicURL string) (*companyAuth, error) {
	if cfg == nil || cfg.AuthMode != "companyauth" || cfg.CaldasAuthURL == "" {
		return nil, nil
	}
	redirect := cfg.CaldasRedirectURL
	if redirect == "" {
		redirect = strings.TrimRight(publicURL, "/") + "/api/auth/callback/caldas"
	}
	return &companyAuth{
		cfg:    oauth2.Config{ClientID: cfg.CaldasClientID, ClientSecret: cfg.CaldasClientSecret, RedirectURL: redirect, Scopes: []string{"openid", "profile", "email"}},
		issuer: strings.TrimRight(cfg.CaldasAuthURL, "/") + "/api/auth",
		http:   &http.Client{Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		states: make(map[string]companyState),
	}, nil
}

// Discover only in company mode, when a user starts sign-in. Local installs never contact the provider.
func (c *companyAuth) discover(ctx context.Context) (*oidc.Provider, oauth2.Config, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.provider == nil {
		provider, err := oidc.NewProvider(oidc.ClientContext(ctx, c.http), c.issuer)
		if err != nil {
			return nil, oauth2.Config{}, err
		}
		c.provider = provider
	}
	cfg := c.cfg
	cfg.Endpoint = c.provider.Endpoint()
	cfg.Endpoint.AuthStyle = oauth2.AuthStyleInHeader
	return c.provider, cfg, nil
}

func randomURLToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(b)
}
func pkceChallenge(verifier string) string {
	hash := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(hash[:])
}
func (h *AuthHandler) companyLogin(w http.ResponseWriter, r *http.Request) {
	if !h.allowedOrigin(w, r) {
		return
	}
	if !h.limiter.Allow("company|"+rateLimitIP(r), 20) {
		h.tooMany(w)
		return
	}
	if h.company == nil {
		http.NotFound(w, r)
		return
	}
	_, cfg, err := h.company.discover(r.Context())
	if err != nil {
		h.unavailable(w)
		return
	}
	state, verifier, nonce := randomURLToken(32), randomURLToken(32), randomURLToken(32)
	if state == "" || verifier == "" || nonce == "" {
		h.unavailable(w)
		return
	}
	returnTo := "/"
	if id := r.URL.Query().Get("native"); id != "" {
		h.native.Lock()
		pending := h.native.entries[id]
		valid := pending != nil && time.Now().Before(pending.expires)
		h.native.Unlock()
		if !valid {
			writeJSON(w, 400, map[string]string{"error": "sign-in expired; start again in Roomies"})
			return
		}
		setCookie(w, "roomies_native", id, 300, true, h.secureCookie(r))
		returnTo = "/api/auth/google/finish"
	}
	h.company.mu.Lock()
	for key, entry := range h.company.states {
		if time.Now().After(entry.expires) {
			delete(h.company.states, key)
		}
	}
	if len(h.company.states) >= 4096 {
		h.company.mu.Unlock()
		h.tooMany(w)
		return
	}
	h.company.states[state] = companyState{verifier: verifier, nonce: nonce, returnTo: returnTo, expires: time.Now().Add(10 * time.Minute)}
	h.company.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "roomies_auth_state", Value: state, Path: "/api/auth", MaxAge: 600, HttpOnly: true, Secure: h.secureCookie(r), SameSite: http.SameSiteLaxMode})
	authURL := cfg.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier))
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (h *AuthHandler) CompanyCallback(w http.ResponseWriter, r *http.Request) {
	if h.company == nil {
		http.Error(w, "CompanyAuth is not configured", 503)
		return
	}
	state := r.URL.Query().Get("state")
	cookie, err := r.Cookie("roomies_auth_state")
	if state == "" || err != nil || cookie.Value != state {
		http.Error(w, "invalid authentication state", 400)
		return
	}
	h.company.mu.Lock()
	entry, ok := h.company.states[state]
	delete(h.company.states, state)
	h.company.mu.Unlock()
	http.SetCookie(w, &http.Cookie{Name: "roomies_auth_state", Path: "/api/auth", MaxAge: -1, HttpOnly: true, Secure: h.secureCookie(r), SameSite: http.SameSiteLaxMode})
	if !ok || time.Now().After(entry.expires) {
		http.Error(w, "authentication state expired", 400)
		return
	}
	if r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, "/?auth_error=cancelled", 303)
		return
	}
	if r.URL.Query().Get("code") == "" {
		http.Error(w, "missing authorization code", 400)
		return
	}
	ctx := oidc.ClientContext(r.Context(), h.company.http)
	provider, cfg, err := h.company.discover(ctx)
	if err != nil {
		h.unavailable(w)
		return
	}
	token, err := cfg.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(entry.verifier))
	if err != nil {
		h.unavailable(w)
		return
	}
	rawIDToken, _ := token.Extra("id_token").(string)
	idToken, err := provider.VerifierContext(ctx, &oidc.Config{ClientID: cfg.ClientID}).Verify(ctx, rawIDToken)
	if err != nil || idToken.Nonce != entry.nonce || idToken.Subject == "" {
		http.Error(w, "invalid identity token", 401)
		return
	}
	if idToken.AccessTokenHash != "" && idToken.VerifyAccessToken(token.AccessToken) != nil {
		http.Error(w, "invalid access token", 401)
		return
	}
	// Profile claims need not be included in the ID token. Fetch them from the
	// discovered userinfo endpoint, bound to the same verified identity.
	info, err := provider.UserInfo(ctx, oauth2.StaticTokenSource(token))
	if err != nil {
		h.unavailable(w)
		return
	}
	if info.Subject != idToken.Subject {
		http.Error(w, "invalid authentication profile", 401)
		return
	}
	var profile struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if info.Claims(&profile) != nil || strings.TrimSpace(profile.Email) == "" {
		http.Error(w, "invalid authentication profile", 401)
		return
	}
	if profile.Name == "" {
		profile.Name = strings.Split(profile.Email, "@")[0]
	}
	user, err := h.userRepo.UpsertCompanyUser(ctx, idToken.Subject, profile.Name, strings.ToLower(strings.TrimSpace(profile.Email)))
	if errors.Is(err, repository.ErrCompanyAccountConflict) {
		writeJSON(w, 409, map[string]string{"error": "this email belongs to another account; use the original sign-in method"})
		return
	}
	if err != nil {
		h.unavailable(w)
		return
	}
	session, err := h.auth.CreateLocalSession(ctx, user.ID, r)
	if err != nil {
		h.unavailable(w)
		return
	}
	defer session.Body.Close()
	copyAuthCookies(w, session)
	setCookie(w, middleware.SessionHintCookieName, "1", 8*60*60, false, h.secureCookie(r))
	http.Redirect(w, r, entry.returnTo, 303)
}
