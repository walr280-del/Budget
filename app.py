# app.py — Flask application entry point
# Run with: python app.py
# Server starts on http://127.0.0.1:5000

from flask import Flask
from flask_cors import CORS
from database import init_db
from routes import register_routes

# Create the Flask app
app = Flask(__name__)

# Allow cross-origin requests from the frontend during development
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Register all API routes
register_routes(app)

# Create database tables on startup if they don't exist
with app.app_context():
    init_db()

if __name__ == "__main__":
    # debug=True: auto-reloads when a file is saved, shows error tracebacks
    app.run(debug=True, port=5000)
