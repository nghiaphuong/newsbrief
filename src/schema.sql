CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(64) PRIMARY KEY,
  v TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  url VARCHAR(500) NOT NULL UNIQUE,
  lang CHAR(2) NOT NULL DEFAULT 'en',
  region VARCHAR(40) NOT NULL DEFAULT 'intl',
  paywall TINYINT(1) NOT NULL DEFAULT 0,
  filter_keywords TINYINT(1) NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_ok_at DATETIME NULL,
  last_error VARCHAR(500) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  url VARCHAR(700) NOT NULL,
  url_hash CHAR(40) NOT NULL UNIQUE,
  source_name VARCHAR(160) NOT NULL,
  source_domain VARCHAR(160) NULL,
  lang CHAR(2) NOT NULL,
  title_original VARCHAR(600) NOT NULL,
  title_vi VARCHAR(600) NULL,
  published_at DATETIME NULL,
  brief_date DATE NOT NULL,
  content_original MEDIUMTEXT NULL,
  full_text TINYINT(1) NOT NULL DEFAULT 0,
  translation_vi MEDIUMTEXT NULL,
  tin_a_vi TEXT NULL,
  key_figures JSON NULL,
  category VARCHAR(40) NULL,
  relations VARCHAR(255) NULL,
  relevance TINYINT UNSIGNED NULL,
  relevance_reason VARCHAR(500) NULL,
  status ENUM('pending','processing','done','error') NOT NULL DEFAULT 'pending',
  error_msg VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_brief_date (brief_date),
  INDEX idx_category (category),
  FULLTEXT KEY ft_all (title_original, title_vi, tin_a_vi, translation_vi, content_original)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS digests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind ENUM('daily','topic','weekly') NOT NULL,
  brief_date DATE NULL,
  topic VARCHAR(300) NULL,
  date_from DATE NULL,
  date_to DATE NULL,
  length_opt VARCHAR(20) NULL,
  content_vi MEDIUMTEXT NOT NULL,
  article_ids JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_kind_date (kind, brief_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kind VARCHAR(30) NOT NULL,
  trigger_by VARCHAR(20) NOT NULL,
  status ENUM('running','done','error') NOT NULL DEFAULT 'running',
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  stats JSON NULL,
  log MEDIUMTEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
