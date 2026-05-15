# Budget
Smart Expense & Budget Analyzer is a lightweight personal finance tool built specifically for the student experience. Users can log transactions, organize them by category, set monthly spending limits, and view their financial data through a clean dashboard — all without connecting a bank account or creating an account with a third-party service. All data is stored locally on the user's machine in a SQLite database, keeping everything private and simple.
Most college students have a general sense that they overspend, but no clear picture of where their money actually goes. Existing budgeting tools are either too complex — full of bank integrations, subscription fees, and investment dashboards — or too basic to be genuinely useful. This application sits in the middle: a focused, no-setup-required tool that gives students real visibility into their spending without overwhelming them with features they don't need.
Transaction Logging — Add income or expense entries with amount, date, category, tags, and notes through a validated form. A toggle switches between Expense and Income mode before submitting.
Category Management — Organize transactions into default categories (Groceries, Rent, Transport, etc.) or create custom ones. Categories can be deleted from the Settings page.
Monthly Dashboard — View total income, total expenses, net balance, and transaction count for any month. Navigate between months using the arrow controls. Includes a doughnut chart for category breakdown and a bar chart for six-month spending trend.
Budget Goal Setting — Set a monthly spending limit for each category. Progress bars show how close spending is to each limit, turning amber at 80% and red at 100%, with a warning message when a budget is reached.
Transaction History — Browse all transactions with full-text search, category filter, and type filter (income or expense). Results paginate at 8 per page and support delete.
Analytics — View a six-month grouped bar chart comparing income and expenses side by side, a line chart showing trends over time, and a ranked list of top spending categories with percentages.
CSV Export — Export all transactions or a filtered view to a CSV file for use in Excel or sharing with a financial advisor.
Settings — Change currency preference, toggle budget alerts, enable dark mode, manage categories, export all data, or reset the database.


Frontend Technologies Used
TechnologyPurposeHTML5Page structure and semantic markupCSS3Styling, layout (Grid + Flexbox), responsive designVanilla JavaScript (ES6+)DOM manipulation, form validation, API communication, page routingChart.jsCanvas-based data visualizations (doughnut, bar, line charts)

Backend Technologies Used
TechnologyPurposePython 3Core backend languageFlaskLightweight web framework and REST API routingflask-corsCross-Origin Resource Sharing so the frontend can call the APIsqlite3 (standard library)Database access — no separate driver needed

Data Storage / Database Explanation
The application uses SQLite as its database. SQLite stores everything in a single file (backend/database.db) on the user's machine, which means no database server needs to be installed or configured. The schema has four tables:

users — Stores the single default user record and currency preference
categories — Stores default and custom spending categories with name, color, and icon
transactions — Stores every income and expense entry with amount, date, description, tags, notes, and foreign keys to the user and category
budgets — Stores monthly spending limits per category, scoped by month and year

Foreign key constraints are enforced, and the budget table uses a UNIQUE constraint on (user_id, category_id, month, year) so saving a budget for the same category and month automatically updates the existing limit instead of creating a duplicate.

Tech Stack Overview
Browser (HTML / CSS / JavaScript)
        ↕ fetch() — JSON over HTTP
Flask REST API (Python)
        ↕ sqlite3
SQLite Database (database.db)
The frontend is a single HTML file that shows and hides sections using JavaScript — no page reloads. JavaScript sends GET and POST requests to the Flask backend via the Fetch API. Flask validates the data, runs SQL queries through the model functions in models.py, and returns JSON responses. The frontend renders those responses into the DOM and redraws charts as needed.

Language and Framework Justification
Python / Flask — Python is readable, beginner-friendly, and has excellent built-in support for SQLite through its standard library. Flask was chosen over Django because it is a micro-framework that adds only what is needed — routing and request handling — without imposing a rigid project structure. For a project with fewer than a dozen endpoints, Flask is the right-sized tool.
SQLite — Chosen because it requires zero configuration. There is no server to start, no credentials to manage, and no extra software to install. The database is a single file that travels with the project, making setup as simple as running one Python script.
Vanilla JavaScript — React and Vue are powerful, but they introduce build steps and abstraction that hide how the web actually works. Using plain JavaScript demonstrates core language competency and keeps the frontend easy to read and debug without a compiler or bundler.
Chart.js — A lightweight charting library that renders to an HTML canvas element with minimal configuration. Chosen over D3.js because standard chart types (bar, pie, line) require only a few lines of setup, and the charts update reactively without contacting the server.

Installation Instructions
Prerequisites

Python 3.8 or higher
pip (comes with Python)
A modern web browser (Chrome, Firefox, Safari, Edge)

1. Clone the repository
bashgit clone https://github.com/[your-username]/smart-expense-analyzer.git
cd smart-expense-analyzer
2. Install backend dependencies
bashcd backend
pip install -r requirements.txt
3. Start the Flask server
bashpython app.py
You should see:
Database initialized successfully.
 * Running on http://127.0.0.1:5000
 * Debug mode: on
4. Open the application
Leave the terminal running and open frontend/index.html in your browser. The frontend will connect to the Flask server automatically.

Note: If you open index.html without running the backend, the app will still work using your browser's localStorage as temporary storage. Data saved this way will not persist to the database.


Setup and Configuration
No environment variables or configuration files are required. The database is created automatically with default categories the first time app.py runs. To reset all data, either delete backend/database.db and restart the server, or use the Reset All Data button in the Settings page.

Usage Instructions

Adding a transaction — Click + Add in the navigation bar. Select Expense or Income, fill in the description, amount, date, and category, then click Save Transaction.
Viewing the dashboard — Click Dashboard. Use the ‹ and › arrows to navigate between months. The pie chart shows spending by category and the bar chart shows the six-month trend.
Setting a budget — Click Budget. Choose a category and enter a monthly limit, then click Save Budget. Progress bars on the same page show how much of each budget has been spent.
Browsing history — Click History. Use the search box to find transactions by keyword, or use the dropdowns to filter by category or type.
Exporting data — Click Analytics, then Export CSV. A CSV file will download to your computer containing all transactions.
Managing categories — Click Settings. Type a new category name and click + Add. Default categories cannot be deleted; custom ones show an × button.


Project Structure
smart-expense-analyzer/
│
├── frontend/
│   ├── index.html              # Main application — all six pages in one file
│   ├── css/
│   │   └── styles.css          # All styling, CSS variables, responsive breakpoints
│   └── js/
│       ├── app.js              # Navigation, data store, form logic, page rendering
│       ├── charts.js           # All Chart.js rendering functions
│       ├── api.js              # fetch() calls to the Flask backend
│       └── vendor/
│           └── chart.umd.min.js  # Bundled Chart.js for offline use
│
├── backend/
│   ├── app.py                  # Flask entry point — starts server, registers routes
│   ├── database.py             # SQLite connection, table creation, seed data
│   ├── models.py               # All SQL query functions (no SQL in routes)
│   ├── routes.py               # API endpoint definitions and input validation
│   └── requirements.txt        # Python dependencies
│
└── tests/
    └── test_api.py             # 35 unit tests covering all routes and edge cases

Challenges Encountered
1. Keeping the frontend and backend loosely coupled
The biggest design challenge was making sure the frontend could work independently of the backend during early development, and then connect seamlessly once the API was ready. If api.js called Flask directly from the start, Week 2 frontend development would have required the backend to be running at all times.
2. Month indexing mismatch
JavaScript's Date object uses 0-indexed months (January = 0, December = 11), but SQLite stores dates as YYYY-MM-DD strings where months are 1-indexed. This caused filtering bugs where transactions in January would not appear when querying month 1.
3. Budget upsert logic
Setting a budget for the same category twice in the same month was creating duplicate rows instead of updating the existing one.
4. Charts not rendering without an internet connection
Chart.js was loaded from a CDN, which meant the charts were blank if the user opened the app offline or in a restricted network environment.

Solutions Implemented
1. localStorage stub layer
api.js was written with the same function signatures in both the stub (localStorage) version and the final (fetch) version. This meant app.js never needed to change — only api.js was updated when the backend was ready. The transition from Week 2 to Week 3 required zero changes to page logic.
2. Month conversion in api.js
All month values are converted in api.js before being sent to the server — filters.month + 1 on the way out and no conversion needed on the way back since dates come back as full strings. This keeps the fix in one place rather than scattered across the codebase.
3. SQLite UPSERT
The budget insert query was updated to use ON CONFLICT(user_id, category_id, month, year) DO UPDATE SET monthly_limit = excluded.monthly_limit. This handles the duplicate case at the database level, requiring no extra application logic.
4. Bundled Chart.js
Chart.js was downloaded and stored locally in frontend/js/vendor/chart.umd.min.js. The <script> tag in index.html was updated to point to this local copy. The app now works fully offline.

Future Improvements

User authentication — Add login and registration so multiple users can have separate accounts on the same machine or a shared server.
Recurring transactions — Allow users to mark a transaction as recurring (weekly, monthly), so it appears automatically without manual re-entry.
Mobile app — Convert the frontend to a Progressive Web App (PWA) so it can be installed on a phone and used like a native app.
Bank import — Support importing transactions from a CSV exported by a bank or credit card, so users do not need to enter every transaction manually.
Spending insights — Add automated observations like "You spent 30% more on Dining Out this month than last month" to surface trends without requiring the user to read the charts.
Data backup and sync — Allow users to export a full backup of their database and restore it on a different machine, or optionally sync to a cloud storage service.
Edit transactions — Currently, transactions can only be deleted and re-entered. A proper edit flow would improve the experience significantly.
