package handlers_test

import (
	"encoding/base64"
	"encoding/json"
	"github.com/roomies/backend/internal/betterauth"
	"github.com/roomies/backend/internal/models"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jmoiron/sqlx"
	roomiesclock "github.com/roomies/backend/internal/clock"
	"github.com/roomies/backend/internal/config"
	"github.com/roomies/backend/internal/database"
	"github.com/roomies/backend/internal/providers"
	"github.com/roomies/backend/internal/repository"
	"github.com/roomies/backend/internal/server"
)

type testEnv struct {
	Router           http.Handler
	DB               *sqlx.DB
	Clock            *roomiesclock.FakeClock
	Config           *config.Config
	UserRepo         *repository.UserRepository
	HouseRepo        *repository.HouseRepository
	ExpenseRepo      *repository.ExpenseRepository
	NoteRepo         *repository.NoteRepository
	ReliabilityRepo  *repository.ReliabilityRepository
	NotificationRepo *repository.NotificationRepository
	HouseholdRepo    *repository.HouseholdRepository
	Authority        *betterauth.Client
	Cleanup          func()
}

func newTestEnv(t *testing.T) *testEnv {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "sqlite://:memory:"
	}
	db, err := database.Connect(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	if err := database.RunMigrations(db); err != nil {
		t.Fatal(err)
	}
	clk := roomiesclock.NewFake(time.Date(2025, time.January, 1, 12, 0, 0, 0, time.UTC))
	cfg := &config.Config{
		Port:               "8080",
		WorkerHealthPort:   "8081",
		DatabaseURL:        databaseURL,
		Environment:        "test",
		CORSAllowedOrigins: []string{"http://localhost:8081"},
		PublicBaseURL:      "https://roomies.test",
		InvitationTTL:      168,
		JobPollInterval:    1,
		JobLeaseSeconds:    30,
	}
	userRepo := repository.NewUserRepository(db)
	houseRepo := repository.NewHouseRepository(db)
	notificationKey := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("n", 32)))
	notificationCipher, err := providers.NewNotificationDeliveryCipher("test-notification-key", notificationKey, "")
	if err != nil {
		t.Fatal(err)
	}
	notificationRepo := repository.NewNotificationRepository(db, clk, notificationCipher)
	expenseRepo := repository.NewExpenseRepository(db, notificationRepo)
	noteRepo := repository.NewNoteRepository(db)
	reliabilityRepo := repository.NewReliabilityRepository(db, clk)
	householdRepo := repository.NewHouseholdRepository(db, clk)
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	authority := newAuthFixture(t, userRepo)
	router := server.NewHandler(server.Dependencies{
		Config:           cfg,
		Auth:             authority,
		Logger:           logger,
		Clock:            clk,
		UserRepo:         userRepo,
		HouseRepo:        houseRepo,
		ExpenseRepo:      expenseRepo,
		NoteRepo:         noteRepo,
		ReliabilityRepo:  reliabilityRepo,
		NotificationRepo: notificationRepo,
		HouseholdRepo:    householdRepo,
	})
	return &testEnv{
		Router:           router,
		DB:               db,
		Clock:            clk,
		Config:           cfg,
		UserRepo:         userRepo,
		HouseRepo:        houseRepo,
		ExpenseRepo:      expenseRepo,
		NoteRepo:         noteRepo,
		ReliabilityRepo:  reliabilityRepo,
		NotificationRepo: notificationRepo,
		HouseholdRepo:    householdRepo,
		Authority:        authority,
		Cleanup:          func() { _ = db.Close() },
	}
}

// Domain handler tests use a fake authority; src/auth tests exercise real Better Auth.
func newAuthFixture(t *testing.T, users *repository.UserRepository) *betterauth.Client {
	t.Helper()
	var mu sync.Mutex
	sessions := map[string]string{}
	passwords := map[string]string{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" {
			if cookie, err := r.Cookie("roomies_session"); err == nil {
				token = cookie.Value
			}
		}
		switch r.URL.Path {
		case "/api/auth/get-session":
			id, ok := sessions[token]
			if !ok {
				json.NewEncoder(w).Encode(nil)
				return
			}
			user, err := users.GetByID(r.Context(), id)
			if err != nil {
				json.NewEncoder(w).Encode(nil)
				return
			}
			json.NewEncoder(w).Encode(map[string]any{"user": user, "session": map[string]string{"id": token}})
		case "/api/auth/sign-out":
			delete(sessions, token)
			http.SetCookie(w, &http.Cookie{Name: "roomies_session", Value: "", MaxAge: -1, Path: "/", HttpOnly: true, Secure: true})
			json.NewEncoder(w).Encode(map[string]bool{"success": true})
		case "/api/auth/sign-up/email", "/api/auth/sign-in/email":
			var req models.RegisterRequest
			json.NewDecoder(r.Body).Decode(&req)
			var user *models.User
			if r.URL.Path == "/api/auth/sign-up/email" {
				user = &models.User{ID: models.NewID(), Name: req.Name, Email: req.Email, CreatedAt: time.Now()}
				if err := users.Create(r.Context(), user); err != nil {
					w.WriteHeader(422)
					json.NewEncoder(w).Encode(map[string]string{"message": "already registered"})
					return
				}
				passwords[user.ID] = req.Password
			} else {
				var err error
				user, err = users.GetByEmail(r.Context(), req.Email)
				if err != nil || passwords[user.ID] != req.Password {
					w.WriteHeader(401)
					json.NewEncoder(w).Encode(map[string]string{"message": "invalid credentials"})
					return
				}
			}
			token = models.NewID()
			sessions[token] = user.ID
			http.SetCookie(w, &http.Cookie{Name: "roomies_session", Value: token, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode})
			w.Header().Set("set-auth-token", token)
			json.NewEncoder(w).Encode(models.AuthResponse{Token: token, User: *user})
		default:
			w.WriteHeader(404)
		}
	}))
	t.Cleanup(srv.Close)
	client, err := betterauth.NewClient(srv.URL, "")
	if err != nil {
		t.Fatal(err)
	}
	return client
}
