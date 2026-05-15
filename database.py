# database.py
# Handles SQLite connection and table creation.
# All other modules import get_connection() from here.

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "database.db")


def get_connection():
    """Return a SQLite connection. row_factory makes rows come back as dicts."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create all tables on startup. Safe to call every run — uses IF NOT EXISTS."""
    conn = get_connection()
    cur  = conn.cursor()

    # Users (single user for now, schema supports multiple later)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT    NOT NULL DEFAULT 'student',
            currency   TEXT    NOT NULL DEFAULT 'USD',
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)

    # Seed one default user if empty
    if cur.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0:
        cur.execute("INSERT INTO users (username) VALUES ('student')")

    # Categories
    cur.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL DEFAULT 1,
            name       TEXT    NOT NULL,
            color_hex  TEXT    NOT NULL DEFAULT '#2E6DB4',
            icon       TEXT    NOT NULL DEFAULT '💰',
            is_default INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # Seed default categories
    if cur.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
        defaults = [
            ("Groceries",     "#1D9E75", "🛒",  1),
            ("Rent",          "#E24B4A", "🏠",  1),
            ("Transport",     "#2E6DB4", "🚌",  1),
            ("Dining Out",    "#F0A500", "🍕",  1),
            ("Entertainment", "#8B5CF6", "🎬",  1),
            ("Education",     "#14B8A6", "📚",  1),
            ("Income",        "#1D9E75", "💼",  1),
            ("Other",         "#6B7280", "📦",  1),
        ]
        cur.executemany(
            "INSERT INTO categories (name, color_hex, icon, is_default) VALUES (?,?,?,?)",
            defaults
        )

    # Transactions
    cur.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL DEFAULT 1,
            category_id INTEGER NOT NULL,
            type        TEXT    NOT NULL CHECK(type IN ('income','expense')),
            amount      REAL    NOT NULL CHECK(amount > 0),
            description TEXT    NOT NULL,
            date        TEXT    NOT NULL,
            tags        TEXT    NOT NULL DEFAULT '',
            notes       TEXT    NOT NULL DEFAULT '',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id)     REFERENCES users(id),
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    # Budgets
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id       INTEGER NOT NULL DEFAULT 1,
            category_id   INTEGER NOT NULL,
            monthly_limit REAL    NOT NULL CHECK(monthly_limit > 0),
            month         INTEGER NOT NULL,
            year          INTEGER NOT NULL,
            UNIQUE(user_id, category_id, month, year),
            FOREIGN KEY (user_id)     REFERENCES users(id),
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )
    """)

    conn.commit()
    conn.close()
    print("Database initialized successfully.")
