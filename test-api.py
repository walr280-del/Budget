# test_api.py
# Unit tests for the Smart Expense & Budget Analyzer backend.
# Run from the project root with: python -m pytest tests/test_api.py -v
# Or: python tests/test_api.py

import sys
import os
import json
import unittest
import tempfile

# Add the backend folder to the path so we can import from it
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import database
from app import app


class BaseTestCase(unittest.TestCase):
    """Sets up a fresh in-memory database before every test."""

    def setUp(self):
        # Point the database at a temp file so tests never touch the real database.db
        self.db_fd, self.db_path = tempfile.mkstemp(suffix='.db')
        database.DB_PATH = self.db_path

        # Flask test client
        app.config['TESTING'] = True
        self.client = app.test_client()

        # Initialize schema and seed data
        database.init_db()

    def tearDown(self):
        os.close(self.db_fd)
        os.unlink(self.db_path)

    # ── Helpers ──────────────────────────────────────────────────────────────

    def post_json(self, url, data):
        return self.client.post(
            url,
            data=json.dumps(data),
            content_type='application/json'
        )

    def add_sample_transaction(self, tx_type='expense', amount=50.00,
                                description='Test purchase', date='2026-04-15',
                                category_id=1):
        return self.post_json('/api/transactions', {
            'type':        tx_type,
            'amount':      amount,
            'description': description,
            'date':        date,
            'category_id': category_id,
        })


# ── HEALTH CHECK ──────────────────────────────────────────────────────────────

class TestHealth(BaseTestCase):

    def test_health_returns_ok(self):
        """Health endpoint should return 200 and status ok."""
        res  = self.client.get('/api/health')
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(data['status'], 'ok')


# ── CATEGORIES ────────────────────────────────────────────────────────────────

class TestCategories(BaseTestCase):

    def test_get_categories_returns_list(self):
        """GET /api/categories should return a list of seeded defaults."""
        res  = self.client.get('/api/categories')
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)

    def test_get_categories_includes_groceries(self):
        """Default seed should include a Groceries category."""
        res   = self.client.get('/api/categories')
        data  = json.loads(res.data)
        names = [c['name'] for c in data]
        self.assertIn('Groceries', names)

    def test_create_category_success(self):
        """POST /api/categories with valid data should return 201."""
        res  = self.post_json('/api/categories', {'name': 'Healthcare'})
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(data['name'], 'Healthcare')
        self.assertIn('id', data)

    def test_create_category_missing_name(self):
        """POST /api/categories without a name should return 400."""
        res  = self.post_json('/api/categories', {'name': ''})
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 400)
        self.assertIn('errors', data)

    def test_create_category_name_too_long(self):
        """Category name over 50 characters should return 400."""
        res  = self.post_json('/api/categories', {'name': 'A' * 51})
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 400)

    def test_delete_custom_category(self):
        """A custom (non-default) category should be deletable."""
        # Create a custom category
        create_res = self.post_json('/api/categories', {'name': 'Hobbies'})
        cat_id     = json.loads(create_res.data)['id']

        # Delete it
        del_res = self.client.delete(f'/api/categories/{cat_id}')
        self.assertEqual(del_res.status_code, 200)

        # Confirm it's gone
        all_cats  = json.loads(self.client.get('/api/categories').data)
        cat_names = [c['name'] for c in all_cats]
        self.assertNotIn('Hobbies', cat_names)

    def test_delete_default_category_does_nothing(self):
        """Default categories should not be deletable."""
        # Category id=1 is a default (Groceries)
        self.client.delete('/api/categories/1')
        all_cats  = json.loads(self.client.get('/api/categories').data)
        cat_names = [c['name'] for c in all_cats]
        self.assertIn('Groceries', cat_names)


# ── TRANSACTIONS ──────────────────────────────────────────────────────────────

class TestTransactions(BaseTestCase):

    def test_get_transactions_empty_at_start(self):
        """Transaction list should be empty before any are added."""
        res  = self.client.get('/api/transactions')
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(data), 0)

    def test_create_expense_success(self):
        """POST /api/transactions with valid expense data should return 201."""
        res  = self.add_sample_transaction()
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(data['type'], 'expense')
        self.assertEqual(data['amount'], 50.00)
        self.assertEqual(data['description'], 'Test purchase')

    def test_create_income_success(self):
        """POST /api/transactions should accept type=income."""
        res  = self.add_sample_transaction(tx_type='income', amount=1200.00,
                                            description='Paycheck')
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 201)
        self.assertEqual(data['type'], 'income')

    def test_create_transaction_missing_description(self):
        """Transaction without description should return 400."""
        res  = self.post_json('/api/transactions', {
            'type': 'expense', 'amount': 20, 'date': '2026-04-01',
            'category_id': 1, 'description': ''
        })
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 400)
        self.assertIn('errors', data)

    def test_create_transaction_negative_amount(self):
        """Negative amount should return 400."""
        res  = self.post_json('/api/transactions', {
            'type': 'expense', 'amount': -10, 'description': 'Bad',
            'date': '2026-04-01', 'category_id': 1
        })
        self.assertEqual(res.status_code, 400)

    def test_create_transaction_zero_amount(self):
        """Zero amount should return 400."""
        res  = self.post_json('/api/transactions', {
            'type': 'expense', 'amount': 0, 'description': 'Zero',
            'date': '2026-04-01', 'category_id': 1
        })
        self.assertEqual(res.status_code, 400)

    def test_create_transaction_invalid_type(self):
        """Type other than income/expense should return 400."""
        res  = self.post_json('/api/transactions', {
            'type': 'refund', 'amount': 20, 'description': 'Bad type',
            'date': '2026-04-01', 'category_id': 1
        })
        self.assertEqual(res.status_code, 400)

    def test_create_transaction_missing_date(self):
        """Transaction without date should return 400."""
        res  = self.post_json('/api/transactions', {
            'type': 'expense', 'amount': 20, 'description': 'No date',
            'category_id': 1
        })
        self.assertEqual(res.status_code, 400)

    def test_create_transaction_missing_category(self):
        """Transaction without category_id should return 400."""
        res  = self.post_json('/api/transactions', {
            'type': 'expense', 'amount': 20, 'description': 'No cat',
            'date': '2026-04-01'
        })
        self.assertEqual(res.status_code, 400)

    def test_get_transactions_after_adding(self):
        """Transactions should appear in GET after being created."""
        self.add_sample_transaction(description='Groceries run')
        self.add_sample_transaction(description='Bus ticket', amount=3.50)

        res  = self.client.get('/api/transactions')
        data = json.loads(res.data)
        self.assertEqual(len(data), 2)

    def test_filter_transactions_by_type(self):
        """GET /api/transactions?type=income should only return income entries."""
        self.add_sample_transaction(tx_type='expense', description='Coffee')
        self.add_sample_transaction(tx_type='income',  description='Paycheck')

        res  = self.client.get('/api/transactions?type=income')
        data = json.loads(res.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['type'], 'income')

    def test_filter_transactions_by_month(self):
        """Month filter should only return transactions from that month."""
        self.add_sample_transaction(date='2026-04-10', description='April tx')
        self.add_sample_transaction(date='2026-03-05', description='March tx')

        res  = self.client.get('/api/transactions?month=4&year=2026')
        data = json.loads(res.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['description'], 'April tx')

    def test_search_transactions(self):
        """Search param should filter by description text."""
        self.add_sample_transaction(description='Trader Joes groceries')
        self.add_sample_transaction(description='Netflix subscription')

        res  = self.client.get('/api/transactions?search=netflix')
        data = json.loads(res.data)
        self.assertEqual(len(data), 1)
        self.assertIn('Netflix', data[0]['description'])

    def test_delete_transaction(self):
        """DELETE should remove a transaction from the database."""
        create_res = self.add_sample_transaction()
        tx_id      = json.loads(create_res.data)['id']

        del_res = self.client.delete(f'/api/transactions/{tx_id}')
        self.assertEqual(del_res.status_code, 200)

        all_txs = json.loads(self.client.get('/api/transactions').data)
        self.assertEqual(len(all_txs), 0)

    def test_update_transaction(self):
        """PUT should update a transaction's fields."""
        create_res = self.add_sample_transaction(amount=50, description='Original')
        tx_id      = json.loads(create_res.data)['id']

        res  = self.client.put(
            f'/api/transactions/{tx_id}',
            data=json.dumps({
                'type': 'expense', 'amount': 75, 'description': 'Updated',
                'date': '2026-04-15', 'category_id': 1
            }),
            content_type='application/json'
        )
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(data['amount'], 75.0)
        self.assertEqual(data['description'], 'Updated')

    def test_update_nonexistent_transaction(self):
        """PUT on a transaction that doesn't exist should return 404."""
        res = self.client.put(
            '/api/transactions/99999',
            data=json.dumps({
                'type': 'expense', 'amount': 10, 'description': 'Ghost',
                'date': '2026-04-01', 'category_id': 1
            }),
            content_type='application/json'
        )
        self.assertEqual(res.status_code, 404)


# ── BUDGETS ───────────────────────────────────────────────────────────────────

class TestBudgets(BaseTestCase):

    def test_get_budgets_empty(self):
        """Budget list should be empty before any are set."""
        res  = self.client.get('/api/budget/2026/4')
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(data), 0)

    def test_create_budget_success(self):
        """POST /api/budget with valid data should return 201."""
        res  = self.post_json('/api/budget', {
            'category_id': 1, 'monthly_limit': 300, 'month': 4, 'year': 2026
        })
        self.assertEqual(res.status_code, 201)

    def test_get_budget_after_saving(self):
        """Budget should appear in GET after being saved."""
        self.post_json('/api/budget', {
            'category_id': 1, 'monthly_limit': 300, 'month': 4, 'year': 2026
        })
        res  = self.client.get('/api/budget/2026/4')
        data = json.loads(res.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['monthly_limit'], 300.0)

    def test_budget_upsert_updates_existing(self):
        """Saving a budget for the same category/month should update the limit."""
        self.post_json('/api/budget', {
            'category_id': 1, 'monthly_limit': 200, 'month': 4, 'year': 2026
        })
        self.post_json('/api/budget', {
            'category_id': 1, 'monthly_limit': 500, 'month': 4, 'year': 2026
        })
        res  = self.client.get('/api/budget/2026/4')
        data = json.loads(res.data)
        # Should still be one budget, with the updated limit
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['monthly_limit'], 500.0)

    def test_create_budget_missing_category(self):
        """Budget without category_id should return 400."""
        res = self.post_json('/api/budget', {
            'monthly_limit': 300, 'month': 4, 'year': 2026
        })
        self.assertEqual(res.status_code, 400)

    def test_create_budget_zero_limit(self):
        """Budget with zero limit should return 400."""
        res = self.post_json('/api/budget', {
            'category_id': 1, 'monthly_limit': 0, 'month': 4, 'year': 2026
        })
        self.assertEqual(res.status_code, 400)

    def test_delete_budget(self):
        """DELETE should remove a budget."""
        self.post_json('/api/budget', {
            'category_id': 1, 'monthly_limit': 300, 'month': 4, 'year': 2026
        })
        budget_id = json.loads(self.client.get('/api/budget/2026/4').data)[0]['id']

        self.client.delete(f'/api/budget/{budget_id}')
        res  = self.client.get('/api/budget/2026/4')
        data = json.loads(res.data)
        self.assertEqual(len(data), 0)


# ── SUMMARY ───────────────────────────────────────────────────────────────────

class TestSummary(BaseTestCase):

    def test_summary_empty_month(self):
        """Summary for a month with no transactions should return zeros."""
        res  = self.client.get('/api/summary/2026/4')
        data = json.loads(res.data)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(data['income'],   0)
        self.assertEqual(data['expenses'], 0)
        self.assertEqual(data['net'],      0)
        self.assertEqual(data['count'],    0)

    def test_summary_totals_correct(self):
        """Summary should correctly sum income and expenses for the month."""
        # Add income and expenses in April 2026
        self.add_sample_transaction(tx_type='income',  amount=2400, date='2026-04-01')
        self.add_sample_transaction(tx_type='expense', amount=900,  date='2026-04-05')
        self.add_sample_transaction(tx_type='expense', amount=200,  date='2026-04-10')

        res  = self.client.get('/api/summary/2026/4')
        data = json.loads(res.data)
        self.assertEqual(data['income'],   2400.0)
        self.assertEqual(data['expenses'], 1100.0)
        self.assertEqual(data['net'],      1300.0)
        self.assertEqual(data['count'],    3)

    def test_summary_excludes_other_months(self):
        """Transactions from other months should not appear in the summary."""
        self.add_sample_transaction(amount=100, date='2026-04-01')  # April
        self.add_sample_transaction(amount=999, date='2026-03-01')  # March (should be excluded)

        res  = self.client.get('/api/summary/2026/4')
        data = json.loads(res.data)
        self.assertEqual(data['expenses'], 100.0)

    def test_summary_by_category(self):
        """byCategory should break down expenses by category name."""
        # Category 1 = Groceries (seeded default)
        self.add_sample_transaction(amount=150, date='2026-04-01', category_id=1)
        self.add_sample_transaction(amount=50,  date='2026-04-05', category_id=1)

        res  = self.client.get('/api/summary/2026/4')
        data = json.loads(res.data)
        self.assertIn('byCategory', data)
        self.assertEqual(data['byCategory'].get('Groceries'), 200.0)


# ── RUN ───────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    unittest.main(verbosity=2)
