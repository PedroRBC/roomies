package repository

import (
	"context"
	"sort"
	"time"

	"github.com/roomies/backend/internal/models"
	"github.com/roomies/backend/internal/recurrence"
)

type AgendaEntry struct {
	ID       string    `json:"id"`
	Title    string    `json:"title"`
	Kind     string    `json:"kind"`
	When     time.Time `json:"when"`
	Timezone string    `json:"timezone"`
	AllDay   bool      `json:"all_day"`
}
type Agenda struct {
	Entries   []AgendaEntry `json:"entries"`
	Truncated bool          `json:"truncated"`
}

// Agenda expands the next 31 days, including calendar events already in progress.
func (r *HouseholdRepository) Agenda(ctx context.Context, houseID string) (*Agenda, error) {
	now := r.clock.Now().UTC()
	until := now.AddDate(0, 0, 31)
	chores, err := r.ListChores(ctx, houseID)
	if err != nil {
		return nil, err
	}
	calendar, err := r.ListCalendar(ctx, houseID)
	if err != nil {
		return nil, err
	}
	var completions []models.ChoreCompletion
	err = r.db.SelectContext(ctx, &completions, `SELECT id,chore_id,house_id,occurrence_at,completed_by,completed_at FROM chore_completions WHERE house_id=$1 AND occurrence_at >= $2 AND occurrence_at < $3`, houseID, now, until)
	if err != nil {
		return nil, err
	}
	completed := map[string]bool{}
	for _, c := range completions {
		completed[c.ChoreID+"/"+c.OccurrenceAt.UTC().Format(time.RFC3339)] = true
	}
	entries := []AgendaEntry{}
	for _, chore := range chores {
		if !chore.Enabled {
			continue
		}
		values, err := recurrence.Expand(recurrence.Spec{Timezone: chore.Timezone, DTStartLocal: chore.DueLocal, Rule: chore.RRule, ExDates: chore.ExDates}, now.Add(-time.Nanosecond), until, recurrence.MaxOutputs)
		if err != nil {
			return nil, err
		}
		for _, when := range values {
			if !completed[chore.ID+"/"+when.Format(time.RFC3339)] {
				entries = append(entries, AgendaEntry{ID: chore.ID, Title: chore.Title, Kind: "chore", When: when, Timezone: chore.Timezone})
			}
		}
	}
	for _, event := range calendar {
		loc, err := time.LoadLocation(event.Timezone)
		if err != nil {
			return nil, err
		}
		start, err := time.Parse("2006-01-02T15:04:05", event.StartLocal)
		if err != nil {
			return nil, err
		}
		end, err := time.Parse("2006-01-02T15:04:05", event.EndLocal)
		if err != nil {
			return nil, err
		}
		wallDuration := end.Sub(start)
		// Wall-clock duration keeps all-day and overnight events correct across DST.
		values, err := recurrence.Expand(recurrence.Spec{Timezone: event.Timezone, DTStartLocal: event.StartLocal, Rule: event.RRule, ExDates: event.ExDates}, now.Add(-wallDuration-24*time.Hour), until, recurrence.MaxOutputs)
		if err != nil {
			return nil, err
		}
		for _, when := range values {
			local := when.In(loc)
			wallEnd := time.Date(local.Year(), local.Month(), local.Day(), local.Hour(), local.Minute(), local.Second(), 0, time.UTC).Add(wallDuration)
			actualEnd := time.Date(wallEnd.Year(), wallEnd.Month(), wallEnd.Day(), wallEnd.Hour(), wallEnd.Minute(), wallEnd.Second(), 0, loc)
			if !when.Before(now) || actualEnd.After(now) {
				entries = append(entries, AgendaEntry{ID: event.ID, Title: event.Title, Kind: "calendar", When: when, Timezone: event.Timezone, AllDay: event.AllDay})
			}
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].When.Equal(entries[j].When) {
			return entries[i].ID < entries[j].ID
		}
		return entries[i].When.Before(entries[j].When)
	})
	truncated := len(entries) > 200
	if truncated {
		entries = entries[:200]
	}
	return &Agenda{Entries: entries, Truncated: truncated}, nil
}
