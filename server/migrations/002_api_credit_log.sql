-- ============================================================================
-- Migration 002: API credit log table (Lapis 6 — AGENTS.md)
-- ============================================================================
-- RECONCILED SCHEMA — this is the canonical definition.
-- The old pengen_seblak.sql dump had a different shape (params JSON, no
-- http_status / error_message). This migration reconciles BOTH into one
-- table that the code actually writes to:
--
--   cache.ts logCreditUsage() INSERTs:
--     endpoint, params, credits_used, cache_hit, http_status, error_message,
--     called_at
--
-- Run once against your database. Safe to re-run (uses IF NOT EXISTS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS `api_credit_log` (
  `id`            BIGINT       PRIMARY KEY AUTO_INCREMENT,
  `endpoint`      VARCHAR(255) NOT NULL,
  `params`        JSON         DEFAULT NULL,   -- query params actually sent
  `credits_used`  SMALLINT     NOT NULL DEFAULT 0,
  `cache_hit`     TINYINT(1)   NOT NULL DEFAULT 0,
  `http_status`   SMALLINT     DEFAULT NULL,   -- null = local rejection (400)
  `error_message` VARCHAR(255) DEFAULT NULL,
  `called_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_acl_date`     (`called_at`),
  INDEX `idx_acl_endpoint` (`endpoint`, `called_at`),
  INDEX `idx_acl_billing`  (`called_at`, `cache_hit`, `credits_used`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- Upgrade path for an EXISTING table created from the old dump.
-- Each statement is guarded so re-running is harmless.
-- ============================================================================

-- Add params column if missing
SET @p_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_credit_log'
    AND COLUMN_NAME = 'params'
);
SET @sql = IF(@p_exists = 0,
  'ALTER TABLE api_credit_log ADD COLUMN `params` JSON DEFAULT NULL AFTER `endpoint`',
  'SELECT ''Column params already exists - skipped.'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add http_status column if missing
SET @h_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_credit_log'
    AND COLUMN_NAME = 'http_status'
);
SET @sql = IF(@h_exists = 0,
  'ALTER TABLE api_credit_log ADD COLUMN `http_status` SMALLINT DEFAULT NULL AFTER `cache_hit`',
  'SELECT ''Column http_status already exists - skipped.'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add error_message column if missing
SET @e_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_credit_log'
    AND COLUMN_NAME = 'error_message'
);
SET @sql = IF(@e_exists = 0,
  'ALTER TABLE api_credit_log ADD COLUMN `error_message` VARCHAR(255) DEFAULT NULL AFTER `http_status`',
  'SELECT ''Column error_message already exists - skipped.'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add the billing composite index if missing
SET @i_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_credit_log'
    AND INDEX_NAME = 'idx_acl_billing'
);
SET @sql = IF(@i_exists = 0,
  'ALTER TABLE api_credit_log ADD INDEX `idx_acl_billing` (`called_at`, `cache_hit`, `credits_used`)',
  'SELECT ''Index idx_acl_billing already exists - skipped.'' AS info');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================================
-- Optional: daily rollup view for the admin credit gauge
-- ============================================================================
CREATE OR REPLACE VIEW `v_credit_daily` AS
SELECT
  DATE(`called_at`)                                   AS `day`,
  COUNT(*)                                            AS `total_calls`,
  SUM(CASE WHEN `cache_hit` = 1 THEN 1 ELSE 0 END)    AS `cache_hits`,
  SUM(CASE WHEN `cache_hit` = 0 THEN 1 ELSE 0 END)    AS `upstream_calls`,
  SUM(`credits_used`)                                 AS `credits_used`
FROM `api_credit_log`
GROUP BY DATE(`called_at`)
ORDER BY `day` DESC;

-- ============================================================================
-- Optional: per-endpoint cost breakdown - finds the expensive endpoints
-- ============================================================================
CREATE OR REPLACE VIEW `v_credit_by_endpoint` AS
SELECT
  `endpoint`,
  COUNT(*)                                          AS `calls`,
  SUM(CASE WHEN `cache_hit` = 0 THEN 1 ELSE 0 END)  AS `upstream_calls`,
  SUM(`credits_used`)                               AS `credits_used`
FROM `api_credit_log`
WHERE `called_at` >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY `endpoint`
ORDER BY `credits_used` DESC;
