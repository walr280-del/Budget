# models.py
# All SQL queries live here. Routes call these functions
# and never write SQL directly — keeps the code modular.

from database import get_connection



def get_all_categories():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM categories ORDER BY name").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_category(name, color_hex="#2E6DB4", icon="💰"):
    conn   = get_connection()
    cur    = conn.execute(
        "INSERT INTO categories (name, color_hex, icon) VALUES (?,?,?)",
        (name, color_hex, icon)
    )
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return new_id


def delete_category(category_id):
    # Only non-default categories can be deleted
    conn = get_connection()
    conn.execute(
        "DELETE FROM categories WHERE id=? AND is_default=0",
        (category_id,)
    )
    conn.commit()
    conn.close()


# ── TRANSACTIONS ─────────────────────────────────────────────────────────────

def get_transactions(month=None, year=None, search=None,
                     category_id=None, tx_type=None):
    """Fetch transactions with optional filters. Returns newest first."""
    query  = "SELECT * FROM transactions WHERE 1=1"
    params = []

    if month is not None and year is not None:
        query  += " AND strftime('%m', date)=? AND strftime('%Y', date)=?"
        params += [str(month).zfill(2), str(year)]

    if search:
        like    = f"%{search.lower()}%"
        query  += " AND (LOWER(description) LIKE ? OR LOWER(notes) LIKE ?)"
        params += [like, like]

    if category_id:
        query  += " AND category_id=?"
        params.append(int(category_id))

    if tx_type in ("income", "expense"):
        query  += " AND type=?"
        params.append(tx_type)

    query += " ORDER BY date DESC, id DESC"

    conn = get_connection()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_transaction(data):
    conn = get_connection()
    cur  = conn.execute(
        """INSERT INTO transactions
           (type, amount, description, date, category_id, tags, notes)
           VALUES (?,?,?,?,?,?,?)""",
        (
            data["type"],
            float(data["amount"]),
            data["description"].strip(),
            data["date"],
            int(data["category_id"]),
            data.get("tags", "").strip(),
            data.get("notes", "").strip(),
        )
    )
    conn.commit()
    row = conn.execute("SELECT * FROM transactions WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return dict(row)


def update_transaction(tx_id, data):
    conn = get_connection()
    conn.execute(
        """UPDATE transactions
           SET type=?, amount=?, description=?, date=?, category_id=?, tags=?, notes=?
           WHERE id=?""",
        (
            data["type"],
            float(data["amount"]),
            data["description"].strip(),
            data["date"],
            int(data["category_id"]),
            data.get("tags", "").strip(),
            data.get("notes", "").strip(),
            tx_id,
        )
    )
    conn.commit()
    row = conn.execute("SELECT * FROM transactions WHERE id=?", (tx_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_transaction(tx_id):
    conn = get_connection()
    conn.execute("DELETE FROM transactions WHERE id=?", (tx_id,))
    conn.commit()
    conn.close()


# ── BUDGETS ───────────────────────────────────────────────────────────────────

def get_budgets(month, year):
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM budgets WHERE month=? AND year=?",
        (int(month), int(year))
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_budget(data):
    """Upsert — update the limit if a budget already exists for that category/month/year."""
    conn = get_connection()
    conn.execute(
        """INSERT INTO budgets (category_id, monthly_limit, month, year)
           VALUES (?,?,?,?)
           ON CONFLICT(user_id, category_id, month, year)
           DO UPDATE SET monthly_limit=excluded.monthly_limit""",
        (
            int(data["category_id"]),
            float(data["monthly_limit"]),
            int(data["month"]),
            int(data["year"]),
        )
    )
    conn.commit()
    conn.close()


def delete_budget(budget_id):
    conn = get_connection()
    conn.execute("DELETE FROM budgets WHERE id=?", (budget_id,))
    conn.commit()
    conn.close()


# ── SUMMARY (dashboard data) ──────────────────────────────────────────────────

def get_summary(month, year):
    """Return income, expenses, net, transaction count, and category breakdown."""
    m = str(month).zfill(2)
    y = str(year)

    conn = get_connection()

    income = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='income' AND strftime('%m',date)=? AND strftime('%Y',date)=?",
        (m, y)
    ).fetchone()["t"]

    expenses = conn.execute(
        "SELECT COALESCE(SUM(amount),0) as t FROM transactions WHERE type='expense' AND strftime('%m',date)=? AND strftime('%Y',date)=?",
        (m, y)
    ).fetchone()["t"]

    count = conn.execute(
        "SELECT COUNT(*) as n FROM transactions WHERE strftime('%m',date)=? AND strftime('%Y',date)=?",
        (m, y)
    ).fetchone()["n"]

    # Spending by category (expenses only)
    cat_rows = conn.execute(
        """SELECT c.name, COALESCE(SUM(t.amount),0) AS total
           FROM categories c
           LEFT JOIN transactions t
             ON t.category_id=c.id AND t.type='expense'
            AND strftime('%m',t.date)=? AND strftime('%Y',t.date)=?
           GROUP BY c.id
           HAVING total > 0
           ORDER BY total DESC""",
        (m, y)
    ).fetchall()

    conn.close()
    return {
        "income":     income,
        "expenses":   expenses,
        "net":        income - expenses,
        "count":      count,
        "byCategory": {r["name"]: r["total"] for r in cat_rows},
    }
