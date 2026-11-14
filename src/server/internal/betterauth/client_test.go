package betterauth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSessionRejectsInvalidAndUnavailableAuthority(t *testing.T) {
	for _, tc := range []struct {
		body    string
		status  int
		wantErr bool
	}{
		{`null`, 200, false}, {`{"user":{"id":"u","email":"e"},"session":{"id":"s"}}`, 200, false},
		{`{"user":{"email":"e"}}`, 200, true}, {`broken`, 200, true}, {`{}`, 503, true},
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/auth/get-session" {
				t.Errorf("unexpected path: %s", r.URL.Path)
			}
			if r.Header.Get("Authorization") != "Bearer token" || r.Header.Get("Cookie") != "" {
				t.Error("bearer must take precedence over cookie")
			}
			w.WriteHeader(tc.status)
			w.Write([]byte(tc.body))
		}))
		client, err := NewClient(srv.URL, "")
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest("GET", "/", nil)
		req.Header.Set("Authorization", "Bearer token")
		req.AddCookie(&http.Cookie{Name: "roomies_session", Value: "other"})
		session, err := client.GetSession(context.Background(), req)
		if (err != nil) != tc.wantErr {
			t.Fatalf("%s: session=%v err=%v", tc.body, session, err)
		}
		srv.Close()
	}
}
func TestClientDoesNotFollowRedirects(t *testing.T) {
	leaked := false
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { leaked = true; json.NewEncoder(w).Encode(nil) }))
	defer target.Close()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 302) }))
	defer srv.Close()
	client, _ := NewClient(srv.URL, "")
	_, err := client.GetSession(context.Background(), httptest.NewRequest("GET", "/", nil))
	if err == nil || leaked {
		t.Fatalf("redirect leaked credentials: %v %v", leaked, err)
	}
}
