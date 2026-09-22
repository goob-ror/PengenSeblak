-- ============================================================
-- Migration 002: API credit log table (Lapis 6 — AGENTS.md)
-- Run once against your database.
-- ============================================================

CREATE TABLE IF NOT EXISTS `api_credit_log` (
  `id`           BIGINT       PRIMARY KEY AUTO_INCREMENT,
  `endpoint`     VARCHAR(255) NOT NULL,
  `credits_used` SMALLINT     NOT NULL DEFAULT 0,
  `cache_hit`    TINYINT(1)   NOT NULL DEFAULT 0,
  `called_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_acl_date`     (`called_at`),
  INDEX `idx_acl_endpoint` (`endpoint`, `called_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
