package repository

import (
	"context"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/roomies/backend/internal/models"
)

type UserRepository struct {
	db *sqlx.DB
}

func NewUserRepository(db *sqlx.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, user *models.User) error {
	query := `INSERT INTO users (id, name, email, password_hash, workos_user_id, created_at)
		VALUES (:id, :name, :email, :password_hash, :workos_user_id, :created_at)`
	_, err := r.db.NamedExecContext(ctx, query, user)
	return err
}

func (r *UserRepository) GetByID(ctx context.Context, id string) (*models.User, error) {
	var user models.User
	err := r.db.GetContext(ctx, &user, "SELECT id, name, email, password_hash, two_factor_enabled, COALESCE(workos_user_id, '') AS workos_user_id, created_at FROM users WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	var user models.User
	err := r.db.GetContext(ctx, &user, "SELECT id, name, email, password_hash, two_factor_enabled, COALESCE(workos_user_id, '') AS workos_user_id, created_at FROM users WHERE email = $1", email)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// PurgeExpiredRevocations drops revocations for tokens that have expired.
func (r *UserRepository) PurgeExpiredRevocations(ctx context.Context, now time.Time) (int64, error) {
	result, err := r.db.ExecContext(ctx, `DELETE FROM revoked_sessions WHERE expires_at < $1`, now.UTC())
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
