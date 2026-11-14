package handlers

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/roomies/backend/internal/middleware"
	"github.com/roomies/backend/internal/models"
)

func (h *AuthHandler) TwoFactor(w http.ResponseWriter, r *http.Request) {
	if !h.allowedOrigin(w, r) {
		return
	}
	action := chi.URLParam(r, "action")
	switch action {
	case "enable", "disable", "verify-totp", "verify-backup-code":
	default:
		http.NotFound(w, r)
		return
	}
	if !h.limiter.Allow("factor|"+rateLimitIP(r), 20) {
		h.tooMany(w)
		return
	}
	var input struct {
		Password  string `json:"password"`
		Code      string `json:"code"`
		Challenge string `json:"challenge"`
		Backup    bool   `json:"backup"`
	}
	if decodeJSON(w, r, &input) != nil {
		writeJSON(w, 400, models.ErrorResponse{Error: "invalid request body"})
		return
	}
	body := map[string]any{"password": input.Password, "code": strings.TrimSpace(input.Code), "trustDevice": false, "method": "totp"}
	if len(input.Challenge) > 512 || strings.ContainsAny(input.Challenge, ";\r\n") {
		writeJSON(w, 400, models.ErrorResponse{Error: "invalid challenge"})
		return
	}
	if input.Challenge != "" && !isWeb(r) && (action == "verify-totp" || action == "verify-backup-code") {
		r = r.Clone(r.Context())
		r.Header = r.Header.Clone()
		r.Header.Del("Authorization")
		r.Header.Del("Cookie")
		name := "roomies_two_factor"
		if h.secureCookie(r) {
			name = "__Secure-" + name
		}
		r.AddCookie(&http.Cookie{Name: name, Value: input.Challenge})
	}
	if action == "disable" && strings.TrimSpace(input.Code) == "" {
		session, err := h.auth.GetSession(r.Context(), r)
		if err != nil {
			h.unavailable(w)
			return
		}
		if session == nil {
			writeJSON(w, 401, models.ErrorResponse{Error: "authentication required"})
			return
		}
		created := session.Session.CreatedAt
		if created.IsZero() || time.Since(created) > 5*time.Minute || created.After(time.Now().Add(time.Minute)) {
			writeJSON(w, 403, models.ErrorResponse{Error: "enter an authenticator or recovery code, or sign in again before disabling two-factor authentication"})
			return
		}
	}
	if action == "disable" && strings.TrimSpace(input.Code) != "" {
		verification, _ := json.Marshal(map[string]any{"code": input.Code, "trustDevice": false})
		path := "/two-factor/verify-totp"
		if input.Backup {
			path = "/two-factor/verify-backup-code"
		}
		checked, err := h.auth.Do(r.Context(), "POST", path, bytes.NewReader(verification), r)
		if err != nil {
			h.unavailable(w)
			return
		}
		defer checked.Body.Close()
		if checked.StatusCode != 200 {
			h.authError(w, checked, "invalid or expired code")
			return
		}
	}
	data, _ := json.Marshal(body)
	res, err := h.auth.Do(r.Context(), "POST", "/two-factor/"+action, bytes.NewReader(data), r)
	if err != nil {
		h.unavailable(w)
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		h.authError(w, res, "invalid or expired code")
		return
	}
	if action == "verify-totp" || action == "verify-backup-code" {
		h.sessionResponse(w, r, res, 200)
		return
	}
	copyAuthCookies(w, res)
	var result map[string]any
	if json.NewDecoder(io.LimitReader(res.Body, maxRequestBodyBytes)).Decode(&result) != nil {
		h.unavailable(w)
		return
	}
	// Enrollment/disable can rotate the session. Native clients must adopt it.
	if token := res.Header.Get("set-auth-token"); token != "" && !isWeb(r) {
		result["token"] = token
	}
	delete(result, "user")
	writeJSON(w, 200, result)
}

func (h *AuthHandler) Google(w http.ResponseWriter, r *http.Request) {
	if !h.allowedOrigin(w, r) {
		return
	}
	if !h.limiter.Allow("google|"+rateLimitIP(r), 20) {
		h.tooMany(w)
		return
	}
	id := r.URL.Query().Get("native")
	if id != "" {
		h.native.Lock()
		pending := h.native.entries[id]
		valid := pending != nil && time.Now().Before(pending.expires)
		h.native.Unlock()
		if !valid {
			writeJSON(w, 400, models.ErrorResponse{Error: "sign-in expired; start again in Roomies"})
			return
		}
	}
	setCookie(w, "roomies_native", id, 300, true, h.secureCookie(r))
	data, _ := json.Marshal(map[string]any{"provider": "google", "callbackURL": h.publicBaseURL + "/api/auth/google/finish", "errorCallbackURL": h.publicBaseURL + "/api/auth/google/finish", "disableRedirect": true})
	res, err := h.auth.Do(r.Context(), "POST", "/sign-in/social", bytes.NewReader(data), r)
	if err != nil {
		h.unavailable(w)
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		h.authError(w, res)
		return
	}
	var result struct {
		URL string `json:"url"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, maxRequestBodyBytes)).Decode(&result) != nil {
		h.unavailable(w)
		return
	}
	target, err := url.Parse(result.URL)
	if err != nil || target.Scheme != "https" || target.Host != "accounts.google.com" {
		h.unavailable(w)
		return
	}
	copyAuthCookies(w, res)
	if r.Method == "GET" {
		http.Redirect(w, r, result.URL, 303)
		return
	}
	writeJSON(w, 200, map[string]string{"url": result.URL})
}
func (h *AuthHandler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	res, err := h.auth.Do(r.Context(), "GET", "/callback/google?"+r.URL.RawQuery, nil, r)
	if err != nil {
		h.unavailable(w)
		return
	}
	defer res.Body.Close()
	copyAuthCookies(w, res)
	// All OAuth flows have one fixed same-origin return destination.
	http.Redirect(w, r, h.publicBaseURL+"/api/auth/google/finish"+oauthErrorQuery(res.Header.Get("Location")), 303)
}
func oauthErrorQuery(location string) string {
	parsed, err := url.Parse(location)
	if err == nil && parsed.Query().Get("error") != "" {
		return "?error=authentication_failed"
	}
	return ""
}

var googlePage = template.Must(template.New("google").Parse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Roomies · Sign in</title><style>body{font:18px system-ui;background:#f5f7f6;color:#172c29;margin:0;padding:8vh 24px}main{max-width:420px;margin:auto;background:white;border:1px solid #cddbd7;border-radius:20px;padding:32px}label,input,button{display:block;margin-top:16px}input,button{font:inherit;padding:12px;max-width:100%;box-sizing:border-box}button{background:#176b5d;color:white;border:0;border-radius:8px;cursor:pointer}a{color:#176b5d}</style><main><h1>Roomies</h1>{{if .Error}}<p role="alert">{{.Error}}</p>{{end}}{{if .Done}}<p>You can return to Roomies now.</p>{{else if .Factor}}<h2>Two-factor authentication</h2><p>Enter your authenticator code or a recovery code.</p><form method="post"><input type="hidden" name="step" value="verify"><label>Code<input name="code" autocomplete="one-time-code" required maxlength="32" autofocus></label><label><input type="checkbox" name="backup" value="1">Use a recovery code</label><button>Verify</button></form>{{else if .Email}}<p>Continue in the Roomies app as <strong>{{.Email}}</strong>?</p><p>Only continue if you started this sign-in in your own Roomies app.</p><form method="post"><input type="hidden" name="step" value="confirm"><button>Continue in Roomies</button></form>{{else}}<p>Sign-in could not be completed. If you already use email/password, sign in with that method; existing accounts are kept separate from Google.</p><a href="/">Back to Roomies</a>{{end}}</main></html>`))

func (h *AuthHandler) GoogleFinish(w http.ResponseWriter, r *http.Request) {
	if !h.allowedOrigin(w, r) {
		return
	}
	page := struct {
		Error, Email string
		Factor, Done bool
	}{}
	if r.Method == "POST" {
		// Require the browser's Origin on state-changing HTML forms, too.
		if r.Header.Get("Origin") != h.publicBaseURL {
			writeJSON(w, 403, models.ErrorResponse{Error: "untrusted request origin"})
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		if r.ParseForm() != nil {
			http.Error(w, "invalid form", 400)
			return
		}
		if r.Form.Get("step") == "verify" {
			if !h.limiter.Allow("factor|"+rateLimitIP(r), 20) {
				h.tooMany(w)
				return
			}
			path := "/two-factor/verify-totp"
			if r.Form.Get("backup") == "1" {
				path = "/two-factor/verify-backup-code"
			}
			data, _ := json.Marshal(map[string]any{"code": strings.TrimSpace(r.Form.Get("code")), "trustDevice": false})
			res, err := h.auth.Do(r.Context(), "POST", path, bytes.NewReader(data), r)
			if err != nil {
				h.unavailable(w)
				return
			}
			defer res.Body.Close()
			if res.StatusCode == 200 {
				copyAuthCookies(w, res)
				setCookie(w, middleware.SessionHintCookieName, "1", 8*60*60, false, h.secureCookie(r))
				http.Redirect(w, r, h.publicBaseURL+"/api/auth/google/finish", 303)
				return
			}
			page.Error = "Invalid or expired code. Try again, or restart sign-in."
		}
	}
	session, err := h.auth.GetSession(r.Context(), r)
	if err != nil {
		h.unavailable(w)
		return
	}
	if session != nil {
		id := ""
		if c, err := r.Cookie("roomies_native"); err == nil {
			id = c.Value
		}
		if id == "" {
			setCookie(w, middleware.SessionHintCookieName, "1", 8*60*60, false, h.secureCookie(r))
			http.Redirect(w, r, "/", 303)
			return
		}
		page.Email = session.User.Email
		if r.Method == "POST" && r.Form.Get("step") == "confirm" {
			h.native.Lock()
			entry := h.native.entries[id]
			if entry != nil && time.Now().Before(entry.expires) && entry.token == "" {
				entry.token = session.Session.Token
				entry.userID = session.User.ID
				page.Done = true
			} else {
				page.Email = ""
				page.Error = "Sign-in expired. Start again in the app."
			}
			h.native.Unlock()
			setCookie(w, "roomies_native", "", -1, true, h.secureCookie(r))
		}
	} else {
		for _, c := range r.Cookies() {
			if strings.TrimPrefix(c.Name, "__Secure-") == "roomies_two_factor" && c.Value != "" {
				page.Factor = true
			}
		}
	}
	if r.URL.Query().Get("error") != "" {
		page.Error = "Google sign-in failed or was cancelled. Try again, or use email/password."
		page.Factor = false
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
	_ = googlePage.Execute(w, page)
}

type nativeSignIn struct {
	verifier      [32]byte
	expires       time.Time
	token, userID string
}
type nativeSignIns struct {
	sync.Mutex
	entries map[string]*nativeSignIn
}

func randomSignInKey() string {
	var data [32]byte
	if _, err := rand.Read(data[:]); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(data[:])
}
func (h *AuthHandler) NativeStart(w http.ResponseWriter, r *http.Request) {
	if !h.allowedOrigin(w, r) {
		return
	}
	if isWeb(r) {
		http.Error(w, "native only", 400)
		return
	}
	if !h.limiter.Allow("native|"+rateLimitIP(r), 10) {
		h.tooMany(w)
		return
	}
	id, verifier := randomSignInKey(), randomSignInKey()
	h.native.Lock()
	defer h.native.Unlock()
	if h.native.entries == nil {
		h.native.entries = make(map[string]*nativeSignIn)
	}
	for key, entry := range h.native.entries {
		if time.Now().After(entry.expires) {
			delete(h.native.entries, key)
		}
	}
	if len(h.native.entries) >= 4096 {
		h.tooMany(w)
		return
	}
	h.native.entries[id] = &nativeSignIn{verifier: sha256.Sum256([]byte(verifier)), expires: time.Now().Add(5 * time.Minute)}
	path := "/api/auth/google"
	if h.company != nil {
		path = "/api/auth/login"
	}
	writeJSON(w, 200, map[string]string{"id": id, "verifier": verifier, "url": h.publicBaseURL + path + "?native=" + id})
}
func (h *AuthHandler) NativePoll(w http.ResponseWriter, r *http.Request) {
	if !h.allowedOrigin(w, r) {
		return
	}
	if isWeb(r) {
		http.Error(w, "native only", 400)
		return
	}
	if !h.limiter.Allow("poll|"+rateLimitIP(r), 60) {
		h.tooMany(w)
		return
	}
	var input struct {
		ID       string `json:"id"`
		Verifier string `json:"verifier"`
	}
	if decodeJSON(w, r, &input) != nil {
		http.Error(w, "invalid request", 400)
		return
	}
	digest := sha256.Sum256([]byte(input.Verifier))
	h.native.Lock()
	entry := h.native.entries[input.ID]
	if entry == nil || time.Now().After(entry.expires) || subtle.ConstantTimeCompare(digest[:], entry.verifier[:]) != 1 {
		h.native.Unlock()
		writeJSON(w, 400, models.ErrorResponse{Error: "sign-in expired; start again"})
		return
	}
	token, userID := entry.token, entry.userID
	if token != "" {
		delete(h.native.entries, input.ID)
	}
	h.native.Unlock()
	if token == "" {
		writeJSON(w, 202, map[string]bool{"pending": true})
		return
	}
	h.writeSession(w, r, token, userID, 200)
}
