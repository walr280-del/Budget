# routes.py
# Defines every API endpoint. Each route validates input,
# calls a model function, and returns JSON.
# Validation helpers are at the bottom of this file.

from flask import request, jsonify
from models import (
    get_all_categories, create_category, delete_category,
    get_transactions, create_transaction, update_transaction, delete_transaction,
    get_budgets, save_budget, delete_budget,
    get_summary,
)


def register_routes(app):

    # ── HEALTH CHECK ──────────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        """Quick endpoint to confirm the server is running."""
        return jsonify({"status": "ok", "message": "SmartBudget API is running"})


    # ── CATEGORIES ────────────────────────────────────────────────────────────

    @app.route("/api/categories", methods=["GET"])
    def categories_list():
        return jsonify(get_all_categories())

    @app.route("/api/categories", methods=["POST"])
    def categories_create():
        data = request.get_json()
        errors = validate_category(data)
        if errors:
            return jsonify({"errors": errors}), 400

        new_id = create_category(
            data["name"].strip(),
            data.get("color_hex", "#2E6DB4"),
            data.get("icon", "💰"),
        )
        return jsonify({"id": new_id, "name": data["name"].strip()}), 201

    @app.route("/api/categories/<int:cat_id>", methods=["DELETE"])
    def categories_delete(cat_id):
        delete_category(cat_id)
        return jsonify({"deleted": cat_id})


    # ── TRANSACTIONS ──────────────────────────────────────────────────────────

    @app.route("/api/transactions", methods=["GET"])
    def transactions_list():
        # All filters are optional query params
        month       = request.args.get("month",       type=int)
        year        = request.args.get("year",        type=int)
        search      = request.args.get("search",      "").strip()
        category_id = request.args.get("category_id", None)
        tx_type     = request.args.get("type",        None)

        txs = get_transactions(month, year, search or None, category_id, tx_type)
        return jsonify(txs)

    @app.route("/api/transactions", methods=["POST"])
    def transactions_create():
        data   = request.get_json()
        errors = validate_transaction(data)
        if errors:
            return jsonify({"errors": errors}), 400

        tx = create_transaction(data)
        return jsonify(tx), 201

    @app.route("/api/transactions/<int:tx_id>", methods=["PUT"])
    def transactions_update(tx_id):
        data   = request.get_json()
        errors = validate_transaction(data)
        if errors:
            return jsonify({"errors": errors}), 400

        updated = update_transaction(tx_id, data)
        if not updated:
            return jsonify({"error": "Transaction not found"}), 404
        return jsonify(updated)

    @app.route("/api/transactions/<int:tx_id>", methods=["DELETE"])
    def transactions_delete(tx_id):
        delete_transaction(tx_id)
        return jsonify({"deleted": tx_id})


    # ── BUDGETS ───────────────────────────────────────────────────────────────

    @app.route("/api/budget/<int:year>/<int:month>", methods=["GET"])
    def budget_list(year, month):
        return jsonify(get_budgets(month, year))

    @app.route("/api/budget", methods=["POST"])
    def budget_save():
        data   = request.get_json()
        errors = validate_budget(data)
        if errors:
            return jsonify({"errors": errors}), 400

        save_budget(data)
        return jsonify({"saved": True}), 201

    @app.route("/api/budget/<int:budget_id>", methods=["DELETE"])
    def budget_delete(budget_id):
        delete_budget(budget_id)
        return jsonify({"deleted": budget_id})


    # ── SUMMARY ───────────────────────────────────────────────────────────────

    @app.route("/api/summary/<int:year>/<int:month>", methods=["GET"])
    def summary(year, month):
        return jsonify(get_summary(month, year))


    # ── ERROR HANDLERS ────────────────────────────────────────────────────────

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Endpoint not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error"}), 500


    # ── VALIDATION HELPERS ────────────────────────────────────────────────────

    def validate_transaction(data):
        errors = []
        if not data:
            return ["No data provided."]
        if not str(data.get("description", "")).strip():
            errors.append("Description is required.")
        if data.get("type") not in ("income", "expense"):
            errors.append("Type must be 'income' or 'expense'.")
        try:
            if float(data.get("amount", 0)) <= 0:
                errors.append("Amount must be greater than 0.")
        except (ValueError, TypeError):
            errors.append("Amount must be a valid number.")
        if not data.get("date"):
            errors.append("Date is required.")
        if not data.get("category_id"):
            errors.append("Category is required.")
        return errors

    def validate_budget(data):
        errors = []
        if not data:
            return ["No data provided."]
        if not data.get("category_id"):
            errors.append("Category is required.")
        try:
            if float(data.get("monthly_limit", 0)) <= 0:
                errors.append("Monthly limit must be greater than 0.")
        except (ValueError, TypeError):
            errors.append("Monthly limit must be a valid number.")
        if data.get("month") is None or data.get("year") is None:
            errors.append("Month and year are required.")
        return errors

    def validate_category(data):
        errors = []
        if not data:
            return ["No data provided."]
        name = str(data.get("name", "")).strip()
        if not name:
            errors.append("Category name is required.")
        elif len(name) > 50:
            errors.append("Name must be 50 characters or fewer.")
        return errors
