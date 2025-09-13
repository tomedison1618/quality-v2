from flask import Blueprint, request, jsonify
from werkzeug.security import check_password_hash
from flask_jwt_extended import create_access_token
from db import get_db_connection

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
def login():
    print("--- LOGIN ROUTE HIT ---")
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"msg": "Missing username or password"}), 400

    conn = get_db_connection()

    # If connection fails, conn will be None
    if conn is None:
        print("ERROR: Login failed because database connection is None.")
        return jsonify({"msg": "Internal server error: Cannot connect to database"}), 500

    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE username = %s AND is_active = TRUE", (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if user and check_password_hash(user['password_hash'], password):
        print(f"SUCCESS: User '{username}' authenticated successfully.")
        identity = {"id": user['id'], "username": user['username'], "role": user['role']}
        access_token = create_access_token(identity=identity)
        return jsonify(access_token=access_token)

    print(f"ERROR: Authentication failed for user '{username}'.")
    return jsonify({"msg": "Bad username or password"}), 401