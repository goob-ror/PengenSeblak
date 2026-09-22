-- ============================================================
-- Migration: Auth Hardening
-- Adds login_attempts table for brute-force detection and
-- a UNIQUE constraint on users.email.
-- Run once against your database.
-- ============================================================

-- 1. Add UNIQUE index to users.email (if not already present)
-- Using a safer approach with IF NOT EXISTS via a workaround
SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'users'
    AND INDEX_NAME   = 'uq_users_email'
);

-- We use a prepared statement so this is safe to run multiple times
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email)',
  'SELECT ''Index uq_users_email already exists — skipped.'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Create login_attempts table
CREATE TABLE IF NOT EXISTS `login_attempts` (
  `id`           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  `email`        VARCHAR(255) NOT NULL,
  `ip_address`   VARCHAR(45)  NOT NULL,            -- supports IPv6
  `user_agent`   VARCHAR(255) DEFAULT NULL,
  `success`      TINYINT(1)   NOT NULL DEFAULT 0,
  `attempted_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_la_email_time` (`email`, `attempted_at`),  -- for lockout queries
  INDEX `idx_la_ip_time`    (`ip_address`, `attempted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Auto-cleanup: remove attempts older than 24 hours via EVENT (optional)
-- Uncomment and adjust if your MySQL user has EVENT privilege:
-- CREATE EVENT IF NOT EXISTS `cleanup_login_attempts`
--   ON SCHEDULE EVERY 1 HOUR
--   DO DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 24 HOUR);
