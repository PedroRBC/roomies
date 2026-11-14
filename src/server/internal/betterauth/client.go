// Package betterauth connects the Go API to the self-hosted authentication service.
package betterauth

import (
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
)

type Client struct {
	BaseURL string
	HTTP    *http.Client
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
