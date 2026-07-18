import sqlite3 from "sqlite3"
import path from "path"
import fs from "fs"

let db: sqlite3.Database | null = null
let opening: Promise<sqlite3.Database> | null = null

const dbPath = (): string => path.join(process.cwd(), "database", "sqlite", "zeta.sqlite")

const ensureDatabaseDir = (): void => {
  fs.mkdirSync(path.dirname(dbPath()), { recursive: true })
}

const openDatabase = (): Promise<sqlite3.Database> => {
  ensureDatabaseDir()

  return new Promise((resolve, reject) => {
    const conn = new sqlite3.Database(dbPath(), (err) => {
      if (err) {
        reject(err)
        return
      }
      resolve(conn)
    })
  })
}

const runAsync = (conn: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    conn.run(sql, params, (err) => (err ? reject(err) : resolve()))
  })

const execAsync = (conn: sqlite3.Database, sql: string): Promise<void> =>
  new Promise((resolve, reject) => {
    conn.exec(sql, (err) => (err ? reject(err) : resolve()))
  })

const applyPragmas = async (conn: sqlite3.Database): Promise<void> => {
  await execAsync(
    conn,
    `
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -20000;
    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 15000;
    `,
  )
}

export const connect = async (): Promise<sqlite3.Database> => {
  if (db) return db
  if (opening) return opening

  opening = (async () => {
    console.log("[Database] 🔄 Conectando a SQLite...")
    const conn = await openDatabase()
    db = conn

    await applyPragmas(conn)
    await createTables(conn)

    console.log(`[Database] ✅ Conectado a SQLite: ${dbPath()}`)
    return conn
  })()

  try {
    return await opening
  } finally {
    opening = null
  }
}

export function getConnection(): sqlite3.Database {
  if (!db) {
    ensureDatabaseDir()
    db = new sqlite3.Database(dbPath())
    db.run("PRAGMA busy_timeout = 15000")
    db.run("PRAGMA journal_mode = WAL")
    db.run("PRAGMA synchronous = NORMAL")
    db.run("PRAGMA temp_store = MEMORY")
  }

  return db
}

export function closeConnection(): void {
  if (!db) return

  db.close((err) => {
    if (err) console.error("[Database] Error closing database:", err)
    else console.log("[Database] Database connection closed")
  })
  db = null
}

const createTables = async (conn: sqlite3.Database): Promise<void> => {
  await execAsync(
    conn,
    `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '~',
      range TEXT DEFAULT 'User',
      level INTEGER DEFAULT 1,
      experience INTEGER DEFAULT 0,
      genre TEXT DEFAULT NULL,
      description TEXT DEFAULT NULL,
      favorite_character_id TEXT DEFAULT NULL,
      favorite_character_name TEXT DEFAULT NULL,
      sticker_pack TEXT DEFAULT NULL,
      sticker_author TEXT DEFAULT NULL,
      last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS groups_table (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT UNIQUE NOT NULL,
      admins_only_enabled INTEGER DEFAULT 0,
      primary_bot TEXT DEFAULT '',
      moderators_only_enabled INTEGER DEFAULT 0,
      mute_all_enabled INTEGER DEFAULT 0,
      autoadmin_enabled INTEGER DEFAULT 0,
      antilinks_enabled INTEGER DEFAULT 0,
      antispam_enabled INTEGER DEFAULT 0,
      antidelete_enabled INTEGER DEFAULT 0,
      welcomes_enabled INTEGER DEFAULT 0,
      welcome_message TEXT DEFAULT '',
      welcome_image_url TEXT DEFAULT '',
      farewells_enabled INTEGER DEFAULT 0,
      farewell_message TEXT DEFAULT '',
      farewell_image_url TEXT DEFAULT '',
      alerts_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      money INTEGER DEFAULT 0,
      money_deposited INTEGER DEFAULT 0,
      berries INTEGER DEFAULT 0,
      enhancers INTEGER DEFAULT 0,
      cookies INTEGER DEFAULT 0,
      potions INTEGER DEFAULT 0,
      last_hunt_ago INTEGER DEFAULT 0,
      last_work_ago INTEGER DEFAULT 0,
      last_mining_ago INTEGER DEFAULT 0,
      last_daily_ago INTEGER DEFAULT 0,
      last_robbery_ago INTEGER DEFAULT 0,
      last_crime_ago INTEGER DEFAULT 0,
      last_slut_ago INTEGER DEFAULT 0,
      last_trivia_ago INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_jid, user_jid)
    );

    CREATE TABLE IF NOT EXISTS bots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_jid TEXT UNIQUE NOT NULL,
      name TEXT DEFAULT '',
      owner_jid TEXT DEFAULT '',
      owner_lid TEXT DEFAULT '',
      owner_pn TEXT DEFAULT '',
      owner_name TEXT DEFAULT '',
      owner_number TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      thumbnail_url TEXT DEFAULT '',
      submenu_url TEXT DEFAULT '',
      welcome_url TEXT DEFAULT '',
      rpg_url TEXT DEFAULT '',
      channel_url TEXT DEFAULT '',
      facebook_url TEXT DEFAULT '',
      instagram_url TEXT DEFAULT '',
      tiktok_url TEXT DEFAULT '',
      telegram_url TEXT DEFAULT '',
      prefixes TEXT DEFAULT '',
      setup_completed INTEGER DEFAULT 0,
      setup_step INTEGER DEFAULT 0,
      bot_type TEXT DEFAULT 'main',
      parent_bot_jid TEXT DEFAULT '',
      hierarchy_parent_jid TEXT DEFAULT '',
      currency TEXT DEFAULT '',
      username TEXT DEFAULT '',
      status TEXT DEFAULT '',
      autojoin_enabled INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_pokemon (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid TEXT NOT NULL,
      group_jid TEXT NOT NULL,
      pokemon_id INTEGER NOT NULL,
      pokemon_name TEXT NOT NULL,
      pokemon_types TEXT NOT NULL,
      base_stats TEXT NOT NULL,
      sprite_url TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS premium_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code VARCHAR(20) UNIQUE NOT NULL,
      user_jid VARCHAR(255) NOT NULL,
      bot_number VARCHAR(20) DEFAULT NULL,
      bot_type VARCHAR(20) DEFAULT 'premium',
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      used_at DATETIME DEFAULT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      notifications_sent INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS premium_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_jid VARCHAR(255) NOT NULL,
      bot_number VARCHAR(20) NOT NULL,
      code VARCHAR(20) NOT NULL,
      action VARCHAR(50) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bot_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_id TEXT UNIQUE NOT NULL,
      bot_jid TEXT UNIQUE NOT NULL,
      bot_number TEXT NOT NULL,
      owner_jid TEXT NOT NULL,
      user_jid TEXT DEFAULT '',
      bot_type TEXT NOT NULL,
      parent_bot_jid TEXT DEFAULT '',
      session_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active BOOLEAN DEFAULT TRUE,
      expires_at DATETIME DEFAULT NULL,
      notified INTEGER DEFAULT 0,
      notifications_sent INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bot_subowners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_jid TEXT NOT NULL,
      user_jid TEXT NOT NULL,
      added_by TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bot_jid, user_jid)
    );

    CREATE TABLE IF NOT EXISTS bot_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bot_jid TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(bot_jid, key)
    );

    CREATE TABLE IF NOT EXISTS gacha_characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      gender TEXT DEFAULT 'Unknown',
      value INTEGER DEFAULT 1000,
      source TEXT DEFAULT 'Unknown',
      img TEXT DEFAULT '[]',
      vid TEXT DEFAULT '[]',
      user_id TEXT DEFAULT NULL,
      status TEXT DEFAULT 'Libre',
      votes INTEGER DEFAULT 0,
      for_sale BOOLEAN DEFAULT FALSE,
      price INTEGER DEFAULT NULL,
      seller_id TEXT DEFAULT NULL,
      last_removed_time INTEGER DEFAULT NULL,
      bot_jid TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gacha_harem (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      last_claim_time INTEGER DEFAULT NULL,
      last_vote_time INTEGER DEFAULT NULL,
      vote_cooldown INTEGER DEFAULT NULL,
      bot_jid TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, character_id, bot_jid)
    );

    CREATE TABLE IF NOT EXISTS gacha_marketplace (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      price INTEGER NOT NULL,
      bot_jid TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_marriages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      user_a_jid TEXT NOT NULL,
      user_b_jid TEXT NOT NULL,
      married_at INTEGER NOT NULL,
      divorced_at INTEGER DEFAULT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_marriage_proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_jid TEXT NOT NULL,
      proposer_jid TEXT NOT NULL,
      target_jid TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at_ms INTEGER NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      responded_at_ms INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_jid ON users(user_jid);
    CREATE INDEX IF NOT EXISTS idx_groups_jid ON groups_table(group_jid);
    CREATE INDEX IF NOT EXISTS idx_group_users_group ON group_users(group_jid);
    CREATE INDEX IF NOT EXISTS idx_group_users_user ON group_users(user_jid);
    CREATE INDEX IF NOT EXISTS idx_bots_jid ON bots(bot_jid);
    CREATE INDEX IF NOT EXISTS idx_bots_type ON bots(bot_type);
    CREATE INDEX IF NOT EXISTS idx_bot_sessions_bot_jid ON bot_sessions(bot_jid);
    CREATE INDEX IF NOT EXISTS idx_bot_sessions_owner_jid ON bot_sessions(owner_jid);
    CREATE INDEX IF NOT EXISTS idx_bot_sessions_user_jid ON bot_sessions(user_jid);
    CREATE INDEX IF NOT EXISTS idx_bot_sessions_bot_type ON bot_sessions(bot_type);
    CREATE INDEX IF NOT EXISTS idx_bot_sessions_is_active ON bot_sessions(is_active);
    CREATE INDEX IF NOT EXISTS idx_bot_subowners_bot_jid ON bot_subowners(bot_jid);
    CREATE INDEX IF NOT EXISTS idx_bot_subowners_user_jid ON bot_subowners(user_jid);
    CREATE INDEX IF NOT EXISTS idx_bot_settings_bot_key ON bot_settings(bot_jid, key);
    CREATE INDEX IF NOT EXISTS idx_group_marriages_status ON group_marriages(group_jid, status, married_at);
    CREATE INDEX IF NOT EXISTS idx_group_marriage_proposals_pending ON group_marriage_proposals(group_jid, target_jid, status, expires_at_ms);
    `,
  )

  const migrations = [
    `ALTER TABLE users ADD COLUMN genre TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN description TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN favorite_character_id TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN favorite_character_name TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN sticker_pack TEXT DEFAULT NULL`,
    `ALTER TABLE users ADD COLUMN sticker_author TEXT DEFAULT NULL`,
    `ALTER TABLE bots ADD COLUMN owner_name TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN owner_lid TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN owner_pn TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN owner_number TEXT DEFAULT ''`,
    `ALTER TABLE bot_sessions ADD COLUMN parent_bot_jid TEXT DEFAULT ''`,
    `ALTER TABLE bot_sessions ADD COLUMN user_jid TEXT DEFAULT ''`,
    `ALTER TABLE bot_sessions ADD COLUMN notified INTEGER DEFAULT 0`,
    `ALTER TABLE bot_sessions ADD COLUMN notifications_sent INTEGER DEFAULT 0`,
    `ALTER TABLE bots ADD COLUMN autojoin_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE bots ADD COLUMN status TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN username TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN parent_bot_jid TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN hierarchy_parent_jid TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN submenu_url TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN welcome_url TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN rpg_url TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN channel_url TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN facebook_url TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN instagram_url TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN tiktok_url TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN telegram_url TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN prefixes TEXT DEFAULT ''`,
    `ALTER TABLE bots ADD COLUMN setup_completed INTEGER DEFAULT 0`,
    `ALTER TABLE bots ADD COLUMN setup_step INTEGER DEFAULT 0`,
    `ALTER TABLE group_users ADD COLUMN last_crime_ago INTEGER DEFAULT 0`,
    `ALTER TABLE group_users ADD COLUMN last_slut_ago INTEGER DEFAULT 0`,
    `ALTER TABLE group_users ADD COLUMN last_trivia_ago INTEGER DEFAULT 0`,
    `ALTER TABLE groups_table ADD COLUMN mute_all_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE groups_table ADD COLUMN autoadmin_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE groups_table ADD COLUMN antilinks_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE groups_table ADD COLUMN antispam_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE groups_table ADD COLUMN antidelete_enabled INTEGER DEFAULT 0`,
    `ALTER TABLE groups_table ADD COLUMN welcome_image_url TEXT DEFAULT ''`,
    `ALTER TABLE groups_table ADD COLUMN farewell_image_url TEXT DEFAULT ''`,
  ]

  for (const sql of migrations) {
    await runAsync(conn, sql).catch(() => undefined)
  }

  console.log("[Database] ✅ Tablas creadas/verificadas exitosamente")
}
