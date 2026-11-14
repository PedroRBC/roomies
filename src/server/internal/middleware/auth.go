package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/roomies/backend/internal/betterauth"
	"github.com/roomies/backend/internal/models"
)

type contextKey string

const userIDKey contextKey = "user_id"
const userEmailKey contextKey = "user_email"

const (
	// SessionCookieName is the HttpOnly Better Auth session cookie.
	SessionCookieName = "roomies_session"
	// SessionHintCookieName is a non-secret flag so the web app can decide
	// whether to call /api/auth/me without probing on every anonymous visit.
	SessionHintCookieName = "roomies_session_hint"
)

func GetUserID(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

func GetUserEmail(ctx context.Context) string {
	v, _ := ctx.Value(userEmailKey).(string)
	return v
}

// SessionAuth validates every request against Better Auth so logout revokes copied tokens too.
func SessionAuth(authority *betterauth.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if auth := strings.TrimSpace(r.Header.Get("Authorization")); auth != "" {
				parts := strings.Fields(auth)
				if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
					writeError(w, 401, "invalid authorization header")
					return
				}
			} else {
				_, plain := r.Cookie(SessionCookieName)
				_, secure := r.Cookie("__Secure-" + SessionCookieName)
				if plain != nil && secure != nil {
					writeError(w, 401, "missing session")
					return
				}
			}
			session, err := authority.GetSession(r.Context(), r)
			if err != nil {
				writeError(w, 503, "session check unavailable")
				return
			}
			if session == nil {
				writeError(w, 401, "invalid or expired session")
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, session.User.ID)
			ctx = context.WithValue(ctx, userEmailKey, session.User.Email)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireRole(houseRepo interface {
	GetMember(ctx context.Context, houseID, userID string) (*models.HouseMember, error)
}, allowedRoles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(allowedRoles))
	for _, r := range allowedRoles {
		allowed[r] = true
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := GetUserID(r.Context())
			if userID == "" {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}

			houseID := chi.URLParam(r, "id")
			if houseID == "" {
				writeError(w, http.StatusBadRequest, "house id required")
				return
			}

			member, err := houseRepo.GetMember(r.Context(), houseID, userID)
			if err != nil {
				writeError(w, http.StatusForbidden, "not a member of this house")
				return
			}

			if !allowed[member.Role] {
				writeError(w, http.StatusForbidden, "insufficient permissions")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write([]byte(`{"error":"` + msg + `"}`))
}
