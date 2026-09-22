-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Sep 22, 2026 at 07:20 AM
-- Server version: 8.0.30
-- PHP Version: 8.3.31

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `pengen_seblak`
--

-- --------------------------------------------------------

--
-- Table structure for table `api_cache`
--

CREATE TABLE `api_cache` (
  `cache_key` varchar(255) NOT NULL,
  `endpoint` varchar(255) DEFAULT NULL,
  `params_hash` json DEFAULT NULL,
  `response_data` json DEFAULT NULL,
  `credits_cost` int DEFAULT NULL,
  `fetched_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `api_credit_log`
--

CREATE TABLE `api_credit_log` (
  `id` int NOT NULL,
  `endpoint` varchar(255) DEFAULT NULL,
  `params` json DEFAULT NULL,
  `credits_used` int DEFAULT NULL,
  `cache_hit` tinyint(1) DEFAULT NULL,
  `called_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `derived_scores`
--

CREATE TABLE `derived_scores` (
  `id` int NOT NULL,
  `symbol` varchar(50) NOT NULL,
  `score_type` varchar(50) DEFAULT NULL,
  `score_value` double DEFAULT NULL,
  `score_breakdown` json DEFAULT NULL,
  `calculated_at` timestamp NULL DEFAULT NULL,
  `valid_until` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sector_health_index`
--

CREATE TABLE `sector_health_index` (
  `id` int NOT NULL,
  `sub_sector` varchar(255) DEFAULT NULL,
  `shi_score` double DEFAULT NULL,
  `growth_score` double DEFAULT NULL,
  `stability_score` double DEFAULT NULL,
  `valuation_score` double DEFAULT NULL,
  `momentum_score` double DEFAULT NULL,
  `calculated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shi_history`
--

CREATE TABLE `shi_history` (
  `id` int NOT NULL,
  `sub_sector` varchar(255) DEFAULT NULL,
  `shi_score` double DEFAULT NULL,
  `record_date` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `plan` varchar(50) DEFAULT NULL,
  `last_login` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_alerts`
--

CREATE TABLE `user_alerts` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `symbol` varchar(50) NOT NULL,
  `alert_type` varchar(50) NOT NULL,
  `condition` json DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `triggered_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_screener_presets`
--

CREATE TABLE `user_screener_presets` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `preset_name` varchar(255) NOT NULL,
  `where_clause` json DEFAULT NULL,
  `order_by` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_watchlists`
--

CREATE TABLE `user_watchlists` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `symbol` varchar(50) NOT NULL,
  `note` text,
  `added_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `api_cache`
--
ALTER TABLE `api_cache`
  ADD PRIMARY KEY (`cache_key`);

--
-- Indexes for table `api_credit_log`
--
ALTER TABLE `api_credit_log`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `derived_scores`
--
ALTER TABLE `derived_scores`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sector_health_index`
--
ALTER TABLE `sector_health_index`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `shi_history`
--
ALTER TABLE `shi_history`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `user_alerts`
--
ALTER TABLE `user_alerts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_user_alerts_user` (`user_id`);

--
-- Indexes for table `user_screener_presets`
--
ALTER TABLE `user_screener_presets`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_user_screener_presets_user` (`user_id`);

--
-- Indexes for table `user_watchlists`
--
ALTER TABLE `user_watchlists`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_user_watchlists_user` (`user_id`);

--
-- Constraints for dumped tables
--

--
-- Constraints for table `user_alerts`
--
ALTER TABLE `user_alerts`
  ADD CONSTRAINT `fk_user_alerts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_screener_presets`
--
ALTER TABLE `user_screener_presets`
  ADD CONSTRAINT `fk_user_screener_presets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_watchlists`
--
ALTER TABLE `user_watchlists`
  ADD CONSTRAINT `fk_user_watchlists_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
