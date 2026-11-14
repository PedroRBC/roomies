// Package betterauth provides the Better Auth-compatible authentication contract.
package betterauth

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/roomies/backend/internal/config"
	"github.com/roomies/backend/internal/models"
	"golang.org/x/crypto/bcrypt"
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
	db      *sqlx.DB
	config  *config.Config
}
type Session struct {
	User struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	} `json:"user"`
	Session struct {
		ID        string    `json:"id"`
		Token     string    `json:"token"`
		CreatedAt time.Time `json:"createdAt"`
	} `json:"session"`
}

// NewLocalClient keeps authentication in the Go API process. The HTTP-shaped
// methods below deliberately preserve the Better Auth endpoint contract used
// by the handlers and clients, while all state lives in the shared database.
func NewLocalClient(db *sqlx.DB, cfg *config.Config) (*Client, error) {
	if db == nil || cfg == nil {
		return nil, errors.New("authentication database and config are required")
	}
	return &Client{db: db, config: cfg, BaseURL: cfg.PublicBaseURL}, nil
}

func NewClient(baseURL, caFile string) (*Client, error) {
	u, err := url.Parse(baseURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("invalid AUTH_URL")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if caFile != "" {
		pem, err := os.ReadFile(caFile)
		if err != nil {
			return nil, err
		}
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM(pem) {
			return nil, errors.New("invalid AUTH_CA_FILE")
		}
		transport.TLSClientConfig = &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}
	}
	return &Client{BaseURL: baseURL, HTTP: &http.Client{Transport: transport, Timeout: 8 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}

// Forward credentials to one configured authority; never trust identity headers from callers.
func (c *Client) Do(ctx context.Context, method, path string, body io.Reader, source *http.Request) (*http.Response, error) {
	if c.db != nil {
		return c.localDo(ctx, method, path, body, source)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+"/api/auth"+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	for _, key := range []string{"Origin", "User-Agent"} {
		if v := source.Header.Get(key); v != "" {
			req.Header.Set(key, v)
		}
	}
	if auth := strings.TrimSpace(source.Header.Get("Authorization")); auth != "" {
		req.Header.Set("Authorization", auth)
	} else {
		for _, cookie := range source.Cookies() {
			if IsAuthCookie(cookie.Name) {
				req.AddCookie(cookie)
			}
		}
	}
	forwarded := strings.Split(source.Header.Get("X-Forwarded-For"), ",")
	ip := strings.TrimSpace(forwarded[len(forwarded)-1])
	if ip == "" {
		ip, _, _ = net.SplitHostPort(source.RemoteAddr)
	}
	if ip != "" {
		req.Header.Set("X-Forwarded-For", ip)
	}

	return c.HTTP.Do(req)
}

func localResponse(status int, body []byte) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(bytes.NewReader(body))}
}
func (c *Client) localDo(ctx context.Context, method, path string, body io.Reader, source *http.Request) (*http.Response, error) {
	// Better Auth clients append query options to endpoint paths (for example
	// disableCookieCache on get-session); route by pathname only.
	path = strings.SplitN(path, "?", 2)[0]
	if path == "/roomies-config" {
		r := localResponse(http.StatusOK, []byte(`{"google":false}`))
		if c.config.GoogleClientID != "" {
			r.Body = io.NopCloser(bytes.NewReader([]byte(`{"google":true}`)))
		}
		return r, nil
	}
	var input struct{ Name, Email, Password string }
	if body != nil {
		_ = json.NewDecoder(io.LimitReader(body, 1<<20)).Decode(&input)
	}
	input.Email = strings.ToLower(strings.TrimSpace(input.Email))
	now := time.Now().UTC()
	token := ""
	if auth := strings.TrimSpace(source.Header.Get("Authorization")); strings.HasPrefix(strings.ToLower(auth), "bearer ") {
		token = strings.TrimSpace(auth[7:])
	}
	if token == "" {
		if cookie, err := source.Cookie("roomies_session"); err == nil {
			token = cookie.Value
		}
	}
	switch path {
	case "/sign-up/email":
		if input.Name == "" || input.Email == "" || input.Password == "" {
			return localResponse(400, []byte(`{"message":"invalid request"}`)), nil
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, err
		}
		id := models.NewID()
		_, err = c.db.ExecContext(ctx, `INSERT INTO users (id,name,email,password_hash,created_at,updated_at,email_verified) VALUES ($1,$2,$3,$4,$5,$5,TRUE)`, id, input.Name, input.Email, string(hash), now)
		if err != nil {
			return localResponse(409, []byte(`{"message":"account already exists"}`)), nil
		}
		_, _ = c.db.ExecContext(ctx, `INSERT INTO auth_account (id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES ($1,$2,'credential',$2,$3,$4,$4)`, "credential:"+id, id, string(hash), now)
		return c.localSession(ctx, id, source, http.StatusCreated, now)
	case "/sign-in/email":
		var id, hash string
		if err := c.db.QueryRowContext(ctx, `SELECT id,password_hash FROM users WHERE email=$1`, input.Email).Scan(&id, &hash); err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(input.Password)) != nil {
			return localResponse(401, []byte(`{"message":"invalid credentials"}`)), nil
		}
		return c.localSession(ctx, id, source, http.StatusOK, now)
	case "/get-session":
		if token == "" {
			return localResponse(200, []byte("null")), nil
		}
		var id, email, name string
		var created time.Time
		if err := c.db.QueryRowContext(ctx, `SELECT s."userId",u.email,u.name,s."createdAt" FROM auth_session s JOIN users u ON u.id=s."userId" WHERE s.token=$1 AND s."expiresAt">$2`, token, now).Scan(&id, &email, &name, &created); err != nil {
			return localResponse(200, []byte("null")), nil
		}
		result, _ := json.Marshal(map[string]any{"user": map[string]string{"id": id, "email": email, "name": name}, "session": map[string]any{"id": token, "token": token, "createdAt": created}})
		return localResponse(200, result), nil
	case "/sign-out":
		if token != "" {
			_, _ = c.db.ExecContext(ctx, `DELETE FROM auth_session WHERE token=$1`, token)
		}
		res := localResponse(200, []byte(`{"success":true}`))
		res.Header.Add("Set-Cookie", (&http.Cookie{Name: "roomies_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode}).String())
		return res, nil
	default:
		return localResponse(http.StatusNotFound, nil), nil
	}
}
func (c *Client) localSession(ctx context.Context, userID string, source *http.Request, status int, now time.Time) (*http.Response, error) {
	token := models.NewID()
	expires := now.Add(8 * time.Hour)
	_, err := c.db.ExecContext(ctx, `INSERT INTO auth_session (id,"expiresAt",token,"createdAt","updatedAt","ipAddress","userId") VALUES ($1,$2,$1,$3,$3,'',$4)`, token, expires, now, userID)
	if err != nil {
		return nil, err
	}
	var email, name string
	if err := c.db.QueryRowContext(ctx, `SELECT email,name FROM users WHERE id=$1`, userID).Scan(&email, &name); err != nil {
		return nil, err
	}
	result, _ := json.Marshal(map[string]any{"token": token, "user": map[string]string{"id": userID, "email": email, "name": name}})
	res := localResponse(status, result)
	res.Header.Add("Set-Cookie", (&http.Cookie{Name: "roomies_session", Value: token, Path: "/", MaxAge: 8 * 60 * 60, HttpOnly: true, Secure: strings.HasPrefix(c.config.PublicBaseURL, "https://"), SameSite: http.SameSiteLaxMode}).String())
	res.Header.Set("set-auth-token", token)
	return res, nil
}
func (c *Client) GetSession(ctx context.Context, source *http.Request) (*Session, error) {
	res, err := c.Do(ctx, http.MethodGet, "/get-session?disableCookieCache=true", nil, source)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, errors.New("authentication service unavailable")
	}
	var session *Session
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&session); err != nil {
		return nil, err
	}
	if session != nil && (session.User.ID == "" || session.User.Email == "" || session.Session.ID == "") {
		return nil, errors.New("invalid authentication service response")
	}
	return session, nil
}

func IsAuthCookie(name string) bool {
	name = strings.TrimPrefix(name, "__Secure-")
	switch name {
	case "roomies_session", "roomies_two_factor", "roomies_oauth_state", "roomies_auth.state", "roomies_auth.dont_remember":
		return true
	}
	return false
}

// CreateLocalSession creates the app session after a CompanyAuth OIDC login.
func (c *Client) CreateLocalSession(ctx context.Context, userID string, source *http.Request) (*http.Response, error) {
	if c.db == nil {
		return nil, errors.New("local session storage is required")
	}
	return c.localSession(ctx, userID, source, http.StatusOK, time.Now().UTC())
}
