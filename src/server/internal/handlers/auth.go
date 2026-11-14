package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/roomies/backend/internal/betterauth"
	"github.com/roomies/backend/internal/middleware"
	"github.com/roomies/backend/internal/models"
	"github.com/roomies/backend/internal/repository"
)

type AuthHandler struct {
	userRepo      *repository.UserRepository
	auth          *betterauth.Client
	publicBaseURL string
	limiter       *middleware.WindowLimiter
	accountLimit  *middleware.WindowLimiter
	native        nativeSignIns
}

func NewAuthHandler(users *repository.UserRepository, auth *betterauth.Client, publicURL string) *AuthHandler {
	return &AuthHandler{userRepo: users, auth: auth, publicBaseURL: publicURL, limiter: middleware.NewWindowLimiter(time.Minute), accountLimit: middleware.NewWindowLimiter(15 * time.Minute)}
}
func (h *AuthHandler) Config(w http.ResponseWriter, r *http.Request) {
	google := false
	if res, err := h.auth.Do(r.Context(), "GET", "/roomies-config", nil, r); err == nil {
		defer res.Body.Close()
		var config struct {
			Google bool `json:"google"`
		}
		if res.StatusCode == 200 {
			_ = json.NewDecoder(io.LimitReader(res.Body, 1024)).Decode(&config)
			google = config.Google
		}
	}
	writeJSON(w, 200, map[string]any{"provider": "better-auth", "password": true, "google": google, "two_factor": true})
}
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) { h.authenticate(w, r, true) }
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request)    { h.authenticate(w, r, false) }
func (h *AuthHandler) authenticate(w http.ResponseWriter, r *http.Request, register bool) {
	if !h.allowedOrigin(w, r) {
		return
	}
	if !h.limiter.Allow("auth|"+rateLimitIP(r), 40) {
		h.tooMany(w)
		return
	}
	var req models.RegisterRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeJSON(w, 400, models.ErrorResponse{Error: "invalid request body"})
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Name = strings.TrimSpace(req.Name)
	address, err := mail.ParseAddress(req.Email)
	if err != nil || address.Address != req.Email || len(req.Email) > 254 {
		writeJSON(w, 400, models.ErrorResponse{Error: "email must be valid"})
		return
	}
	if !register && !h.accountLimit.Allow(req.Email, 10) {
		w.Header().Set("Retry-After", "900")
		writeJSON(w, 429, models.ErrorResponse{Error: "too many requests"})
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 128 {
		writeJSON(w, 400, models.ErrorResponse{Error: "password must be between 8 and 128 characters"})
		return
	}
	body := map[string]string{"email": req.Email, "password": req.Password}
	path := "/sign-in/email"
	status := http.StatusOK
	if register {
		if req.Name == "" || len(req.Name) > 100 {
			writeJSON(w, 400, models.ErrorResponse{Error: "name must be between 1 and 100 characters"})
			return
		}
		body["name"] = req.Name
		path = "/sign-up/email"
		status = http.StatusCreated
	}
	data, _ := json.Marshal(body)
	res, err := h.auth.Do(r.Context(), http.MethodPost, path, bytes.NewReader(data), r)
	if err != nil {
		h.unavailable(w)
		return
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		h.authError(w, res)
		return
	}
	h.sessionResponse(w, r, res, status)
}

func (h *AuthHandler) sessionResponse(w http.ResponseWriter, r *http.Request, res *http.Response, status int) {
	var result struct {
		models.AuthResponse
		TwoFactorRedirect bool `json:"twoFactorRedirect"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, maxRequestBodyBytes)).Decode(&result); err != nil {
		h.unavailable(w)
		return
	}
	copyAuthCookies(w, res)
	if result.TwoFactorRedirect {
		body := map[string]any{"two_factor_required": true}
		if !isWeb(r) {
			for _, c := range res.Cookies() {
				if strings.TrimPrefix(c.Name, "__Secure-") == "roomies_two_factor" && c.MaxAge >= 0 {
					body["challenge"] = c.Value
				}
			}
		}
		writeJSON(w, 200, body)
		return
	}
	if result.Token == "" || result.User.ID == "" {
		h.unavailable(w)
		return
	}
	if rotated := res.Header.Get("set-auth-token"); rotated != "" {
		result.Token = rotated
	}
	h.writeSession(w, r, result.Token, result.User.ID, status)
}
func isWeb(r *http.Request) bool { return strings.EqualFold(r.Header.Get("X-Roomies-Client"), "web") }
func (h *AuthHandler) writeSession(w http.ResponseWriter, r *http.Request, token, userID string, status int) {
	user, err := h.userRepo.GetByID(r.Context(), userID)
	if err != nil {
		h.unavailable(w)
		return
	}
	setCookie(w, middleware.SessionHintCookieName, "1", 8*60*60, false, h.secureCookie(r))
	if isWeb(r) {
		writeJSON(w, status, map[string]any{"user": user})
		return
	}
	writeJSON(w, status, models.AuthResponse{Token: token, User: *user})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if !h.allowedOrigin(w, r) {
		return
	}
	res, err := h.auth.Do(r.Context(), http.MethodPost, "/sign-out", strings.NewReader("{}"), r)
	if err != nil {
		h.unavailable(w)
		return
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		h.authError(w, res)
		return
	}
	copyAuthCookies(w, res)
	for _, name := range []string{middleware.SessionCookieName, "__Secure-" + middleware.SessionCookieName, middleware.SessionHintCookieName} {
		setCookie(w, name, "", -1, name != middleware.SessionHintCookieName, h.secureCookie(r))
	}
	w.WriteHeader(http.StatusNoContent)
}
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, err := h.userRepo.GetByID(r.Context(), middleware.GetUserID(r.Context()))
	if err != nil {
		writeJSON(w, 404, models.ErrorResponse{Error: "user not found"})
		return
	}
	writeJSON(w, 200, user)
}
func (h *AuthHandler) allowedOrigin(w http.ResponseWriter, r *http.Request) bool {
	if origin := r.Header.Get("Origin"); origin != "" && origin != h.publicBaseURL {
		writeJSON(w, 403, models.ErrorResponse{Error: "untrusted request origin"})
		return false
	}
	return true
}
func (h *AuthHandler) authError(w http.ResponseWriter, res *http.Response, invalidMessage ...string) {
	status := res.StatusCode
	if status == 429 {
		h.tooMany(w)
		return
	}
	if status >= 500 || status < 400 {
		h.unavailable(w)
		return
	}
	var result struct {
		Message string `json:"message"`
	}
	_ = json.NewDecoder(io.LimitReader(res.Body, maxRequestBodyBytes)).Decode(&result)
	message := "authentication failed"
	if status == 401 {
		message = "invalid email or password"
		if len(invalidMessage) > 0 {
			message = invalidMessage[0]
		}
	} else if status == 422 || status == 409 {
		message = "an account with this email already exists"
	} else if result.Message != "" {
		message = result.Message
	}
	writeJSON(w, status, models.ErrorResponse{Error: message})
}
func (h *AuthHandler) unavailable(w http.ResponseWriter) {
	writeJSON(w, 503, models.ErrorResponse{Error: "sign-in is temporarily unavailable; try again"})
}
func (h *AuthHandler) tooMany(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "60")
	writeJSON(w, 429, models.ErrorResponse{Error: "too many requests"})
}
func (h *AuthHandler) secureCookie(r *http.Request) bool {
	return strings.HasPrefix(h.publicBaseURL, "https://")
}
func copyAuthCookies(w http.ResponseWriter, res *http.Response) {
	for _, cookie := range res.Cookies() {
		if betterauth.IsAuthCookie(cookie.Name) {
			http.SetCookie(w, cookie)
		}
	}
}
func setCookie(w http.ResponseWriter, name, value string, maxAge int, httpOnly, secure bool) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", MaxAge: maxAge, HttpOnly: httpOnly, Secure: secure, SameSite: http.SameSiteLaxMode})
}
func rateLimitIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
			return ip
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
