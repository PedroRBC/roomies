package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/roomies/backend/internal/models"
)

func TestDashboardCompletionsBoundsAndIsolation(t *testing.T) {
	env := newTestEnv(t)
	defer env.Cleanup()
	admin := registerUser(t, env.Router, "Admin", "dash-admin@test", "password123")
	outsider := registerUser(t, env.Router, "Other", "dash-other@test", "password123")
	monitor := registerUser(t, env.Router, "Monitor", "dash-monitor@test", "password123")
	house := createHouse(t, env.Router, admin, "Home")
	other := createHouse(t, env.Router, admin, "Other")
	addMember(t, env.Router, admin, house, monitor, "monitor")
	enabled := true
	body := models.ChoreRequest{Title: "Clean", Timezone: "UTC", DueLocal: "2026-01-01T10:00:00", RRule: "FREQ=DAILY;COUNT=3", Enabled: &enabled}
	created := authenticatedRequest(t, env.Router, http.MethodPost, "/api/houses/"+house+"/chores", admin, body)
	if created.Code != 201 {
		t.Fatal(created.Body.String())
	}
	var chore models.Chore
	_ = json.Unmarshal(created.Body.Bytes(), &chore)
	completed := authenticatedRequest(t, env.Router, http.MethodPost, "/api/houses/"+house+"/chores/"+chore.ID+"/completions", admin, models.CompleteChoreRequest{OccurrenceAt: time.Date(2026, 1, 1, 10, 0, 0, 0, time.UTC)})
	if completed.Code != 201 {
		t.Fatal(completed.Body.String())
	}
	var completion models.ChoreCompletion
	_ = json.Unmarshal(completed.Body.Bytes(), &completion)
	from := completion.CompletedAt.UTC().Format("2006-01-02")
	to := completion.CompletedAt.UTC().AddDate(0, 0, 1).Format("2006-01-02")
	query := "?from=" + from + "&to=" + to
	for _, token := range []string{admin, monitor} {
		got := authenticatedRequest(t, env.Router, http.MethodGet, "/api/houses/"+house+"/chore-completions"+query, token, nil)
		var rows []models.ChoreCompletion
		_ = json.Unmarshal(got.Body.Bytes(), &rows)
		if got.Code != 200 || len(rows) != 1 || rows[0].ID != completion.ID {
			t.Fatalf("read: %d %s", got.Code, got.Body.String())
		}
	}
	isolated := authenticatedRequest(t, env.Router, http.MethodGet, "/api/houses/"+other+"/chore-completions"+query, admin, nil)
	if isolated.Code != 200 || isolated.Body.String() != "[]\n" {
		t.Fatalf("isolation: %d %s", isolated.Code, isolated.Body.String())
	}
	denied := authenticatedRequest(t, env.Router, http.MethodGet, "/api/houses/"+house+"/chore-completions"+query, outsider, nil)
	if denied.Code != 403 {
		t.Fatalf("outsider: %d", denied.Code)
	}
	for _, query := range []string{"", "?from=bad&to=2026-01-01", "?from=2026-02-01&to=2026-01-01", "?from=2024-01-01&to=2026-01-01"} {
		got := authenticatedRequest(t, env.Router, http.MethodGet, "/api/houses/"+house+"/chore-completions"+query, admin, nil)
		if got.Code != 400 {
			t.Fatalf("range %s: %d", query, got.Code)
		}
	}
}

func TestAgendaExpandsRecurrenceAndExcludesCompletions(t *testing.T) {
	env := newTestEnv(t)
	defer env.Cleanup()
	admin := registerUser(t, env.Router, "Admin", "agenda-admin@test", "password123")
	outsider := registerUser(t, env.Router, "Other", "agenda-other@test", "password123")
	house := createHouse(t, env.Router, admin, "Home")
	enabled := true
	created := authenticatedRequest(t, env.Router, http.MethodPost, "/api/houses/"+house+"/chores", admin, models.ChoreRequest{Title: "Kitchen reset", Timezone: "UTC", DueLocal: "2025-01-01T13:00:00", RRule: "FREQ=DAILY;COUNT=3", ExDates: []string{"2025-01-03T13:00:00"}, Enabled: &enabled})
	if created.Code != 201 {
		t.Fatal(created.Body.String())
	}
	var chore models.Chore
	_ = json.Unmarshal(created.Body.Bytes(), &chore)
	completed := authenticatedRequest(t, env.Router, http.MethodPost, "/api/houses/"+house+"/chores/"+chore.ID+"/completions", admin, models.CompleteChoreRequest{OccurrenceAt: time.Date(2025, 1, 1, 13, 0, 0, 0, time.UTC)})
	if completed.Code != 201 {
		t.Fatal(completed.Body.String())
	}
	event := authenticatedRequest(t, env.Router, http.MethodPost, "/api/houses/"+house+"/calendar", admin, models.CalendarEventRequest{Title: "House meeting", Timezone: "America/New_York", StartLocal: "2025-01-01T06:00:00", EndLocal: "2025-01-01T08:00:00", RRule: "FREQ=DAILY;COUNT=2"})
	if event.Code != 201 {
		t.Fatal(event.Body.String())
	}
	response := authenticatedRequest(t, env.Router, http.MethodGet, "/api/houses/"+house+"/agenda", admin, nil)
	var agenda struct {
		Entries []struct {
			Title string    `json:"title"`
			When  time.Time `json:"when"`
		}
		Truncated bool `json:"truncated"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &agenda); err != nil {
		t.Fatal(err)
	}
	if response.Code != 200 || len(agenda.Entries) != 3 || agenda.Truncated {
		t.Fatalf("agenda: %d %s", response.Code, response.Body.String())
	}
	if agenda.Entries[0].Title != "House meeting" || !agenda.Entries[0].When.Equal(time.Date(2025, 1, 1, 11, 0, 0, 0, time.UTC)) {
		t.Fatalf("ongoing timezone event missing: %s", response.Body.String())
	}
	if agenda.Entries[2].Title != "Kitchen reset" || !agenda.Entries[2].When.Equal(time.Date(2025, 1, 2, 13, 0, 0, 0, time.UTC)) {
		t.Fatalf("completion/exdate filtering: %s", response.Body.String())
	}
	denied := authenticatedRequest(t, env.Router, http.MethodGet, "/api/houses/"+house+"/agenda", outsider, nil)
	if denied.Code != 403 {
		t.Fatalf("outsider: %d", denied.Code)
	}
	other := createHouse(t, env.Router, admin, "Other")
	isolated := authenticatedRequest(t, env.Router, http.MethodGet, "/api/houses/"+other+"/agenda", admin, nil)
	if isolated.Code != 200 || isolated.Body.String() != "{\"entries\":[],\"truncated\":false}\n" {
		t.Fatalf("isolation: %d %s", isolated.Code, isolated.Body.String())
	}
}
