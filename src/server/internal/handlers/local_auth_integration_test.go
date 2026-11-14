package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/roomies/backend/internal/betterauth"
	"github.com/roomies/backend/internal/server"
)

func TestSelfHostedAuthenticationNeverContactsCompany(t *testing.T) {
	var calls atomic.Int32
	external := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		http.Error(w, "external auth must not be used", 503)
	}))
	defer external.Close()
	env := newTestEnv(t)
	defer env.Cleanup()
	env.Config.AuthMode = "local"
	env.Config.CaldasAuthURL = external.URL
	env.Config.CaldasClientID = "unused"
	env.Config.CaldasClientSecret = "unused"
	auth, err := betterauth.NewLocalClient(env.DB, env.Config)
	if err != nil {
		t.Fatal(err)
	}
	router := server.NewHandler(server.Dependencies{Config: env.Config, Auth: auth, Clock: env.Clock, UserRepo: env.UserRepo, HouseRepo: env.HouseRepo, ExpenseRepo: env.ExpenseRepo, NoteRepo: env.NoteRepo, ReliabilityRepo: env.ReliabilityRepo, NotificationRepo: env.NotificationRepo, HouseholdRepo: env.HouseholdRepo})
	call := func(method, path, body string, cookies []*http.Cookie, token string, web bool) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if web {
			req.Header.Set("X-Roomies-Client", "web")
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		for _, c := range cookies {
			req.AddCookie(c)
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	config := call("GET", "/api/auth/config", "", nil, "", true)
	if !strings.Contains(config.Body.String(), `"company_auth":false`) || !strings.Contains(config.Body.String(), `"password":true`) {
		t.Fatal(config.Body.String())
	}
	result := call("POST", "/api/auth/register", `{"name":"Local Browser","email":"local-browser@example.test","password":"password123"}`, nil, "", true)
	if result.Code != 201 {
		t.Fatalf("register: %d %s", result.Code, result.Body.String())
	}
	var body map[string]any
	if err := json.Unmarshal(result.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if _, ok := body["token"]; ok {
		t.Fatal("browser session leaked a bearer token")
	}
	cookies := result.Result().Cookies()
	if result := call("GET", "/api/auth/me", "", cookies, "", true); result.Code != 200 {
		t.Fatal(result.Body.String())
	}
	if result := call("GET", "/api/houses", "", cookies, "", true); result.Code != 200 {
		t.Fatalf("authenticated resource failed: %d", result.Code)
	}
	if result := call("POST", "/api/auth/logout", `{}`, cookies, "", true); result.Code != 204 {
		t.Fatal(result.Body.String())
	}
	if result := call("GET", "/api/auth/me", "", cookies, "", true); result.Code != 401 {
		t.Fatal("copied cookie remained valid after logout")
	}
	if result := call("POST", "/api/auth/login", `{"email":"local-browser@example.test","password":"incorrect"}`, nil, "", true); result.Code != 401 {
		t.Fatal("wrong password accepted")
	}
	result = call("POST", "/api/auth/login", `{"email":" LOCAL-BROWSER@EXAMPLE.TEST ","password":"password123"}`, nil, "", false)
	if result.Code != 200 {
		t.Fatalf("native login: %d %s", result.Code, result.Body.String())
	}
	var native struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(result.Body.Bytes(), &native); err != nil || native.Token == "" {
		t.Fatal("missing native token")
	}
	if result := call("GET", "/api/auth/me", "", nil, native.Token, false); result.Code != 200 {
		t.Fatal(result.Body.String())
	}
	if result := call("POST", "/api/auth/logout", `{}`, nil, native.Token, false); result.Code != 204 {
		t.Fatal(result.Body.String())
	}
	if result := call("GET", "/api/auth/me", "", nil, native.Token, false); result.Code != 401 {
		t.Fatal("native token remained valid after logout")
	}
	if result := call("GET", "/api/auth/callback/caldas?code=unused&state=unused", "", nil, "", true); result.Code != 503 {
		t.Fatal("company callback available in local mode")
	}
	if calls.Load() != 0 {
		t.Fatalf("local mode made %d external requests", calls.Load())
	}
}
