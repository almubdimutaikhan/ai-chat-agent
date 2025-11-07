/**
 * Database schema initialization for AI Task Flow Agent
 * Uses SQLite via Cloudflare Durable Objects
 */

export const DATABASE_SCHEMA = {
  /**
   * Initialize all required tables for the agent
   * This should be called once when the agent is first created
   */
  initTables: `
    -- Store Trello board sync information
    CREATE TABLE IF NOT EXISTS trello_boards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      total_cards INTEGER DEFAULT 0,
      total_lists INTEGER DEFAULT 0
    );

    -- Store task patterns learned from user behavior
    CREATE TABLE IF NOT EXISTS task_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      avg_completion_minutes INTEGER DEFAULT 0,
      difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
      success_rate REAL DEFAULT 0.0,
      best_time_of_day TEXT,
      task_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Store task completion history
    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      category TEXT,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      time_spent_minutes INTEGER,
      difficulty TEXT CHECK(difficulty IN ('easy', 'medium', 'hard')),
      list_moved_from TEXT,
      list_moved_to TEXT
    );

    -- Store AI recommendations for tracking accuracy
    CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recommended_card_id TEXT NOT NULL,
      recommended_card_name TEXT NOT NULL,
      reason TEXT,
      confidence REAL DEFAULT 0.0,
      estimated_time_minutes INTEGER,
      recommended_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      accepted BOOLEAN DEFAULT 0,
      actual_outcome TEXT
    );

    -- Store raw Trello data for analysis
    CREATE TABLE IF NOT EXISTS trello_cards_snapshot (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      card_desc TEXT,
      list_id TEXT,
      list_name TEXT,
      labels TEXT, -- JSON array of labels
      due_date TIMESTAMP,
      completed BOOLEAN DEFAULT 0,
      synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_task_history_category ON task_history(category);
    CREATE INDEX IF NOT EXISTS idx_task_history_completed ON task_history(completed_at);
    CREATE INDEX IF NOT EXISTS idx_recommendations_accepted ON recommendations(accepted);
    CREATE INDEX IF NOT EXISTS idx_cards_snapshot_list ON trello_cards_snapshot(list_id);
  `,
};

/**
 * Sample queries for common operations
 */
export const QUERIES = {
  // Get all task patterns
  getAllPatterns: `
    SELECT * FROM task_patterns 
    ORDER BY task_count DESC, success_rate DESC
  `,

  // Get pattern by category
  getPatternByCategory: `
    SELECT * FROM task_patterns 
    WHERE category = ? 
    ORDER BY updated_at DESC 
    LIMIT 1
  `,

  // Get recent task history
  getRecentHistory: `
    SELECT * FROM task_history 
    ORDER BY completed_at DESC 
    LIMIT ?
  `,

  // Get task history by category
  getHistoryByCategory: `
    SELECT * FROM task_history 
    WHERE category = ? 
    ORDER BY completed_at DESC
  `,

  // Get recommendation accuracy
  getRecommendationAccuracy: `
    SELECT 
      COUNT(*) as total_recommendations,
      SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) as accepted_count,
      AVG(confidence) as avg_confidence
    FROM recommendations
  `,

  // Get latest board sync info
  getLatestBoardSync: `
    SELECT * FROM trello_boards 
    ORDER BY last_synced DESC 
    LIMIT 1
  `,

  // Insert new task pattern
  insertPattern: `
    INSERT INTO task_patterns 
    (category, avg_completion_minutes, difficulty, success_rate, best_time_of_day, task_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `,

  // Update existing pattern
  updatePattern: `
    UPDATE task_patterns 
    SET 
      avg_completion_minutes = ?,
      difficulty = ?,
      success_rate = ?,
      best_time_of_day = ?,
      task_count = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE category = ?
  `,

  // Insert task history
  insertTaskHistory: `
    INSERT INTO task_history 
    (card_id, card_name, category, completed_at, time_spent_minutes, difficulty)
    VALUES (?, ?, ?, ?, ?, ?)
  `,

  // Insert recommendation
  insertRecommendation: `
    INSERT INTO recommendations 
    (recommended_card_id, recommended_card_name, reason, confidence, estimated_time_minutes)
    VALUES (?, ?, ?, ?, ?)
  `,

  // Update recommendation outcome
  updateRecommendationOutcome: `
    UPDATE recommendations 
    SET accepted = ?, actual_outcome = ?
    WHERE id = ?
  `,
};

