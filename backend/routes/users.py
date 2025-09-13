import mysql.connector
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash
from flask_jwt_extended import jwt_required, get_jwt_identity
from db import get_db_connection
# Import the decorator from our new shared file
from routes.auth_decorators import admin_required

users_bp = Blueprint('users', __name__)


@users_bp.route('', methods=['GET'])
@admin_required
def get_users():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    # Exclude the password_hash from the response for security
    cursor.execute("SELECT id, username, role, is_active, created_at FROM users")
    users = cursor.fetchall()
    cursor.close()
    conn.close()
    # Convert datetime objects to string format for JSON serialization
    for user in users:
        if user.get('created_at'):
            user['created_at'] = user['created_at'].isoformat()
    return jsonify(users)


@users_bp.route('', methods=['POST'])
@admin_required
def create_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'user')

    if not username or not password:
        return jsonify({"msg": "Username and password are required"}), 400
    
    # Ensure the role is one of the valid options
    if role not in ['admin', 'user', 'viewer', 'QC']:
        return jsonify({"msg": "Invalid role specified. Must be 'admin', 'user', 'viewer', or 'QC'."}), 400
    
    password_hash = generate_password_hash(password)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)",
            (username, password_hash, role)
        )
        conn.commit()
        return jsonify({"msg": "User created successfully"}), 201
    except mysql.connector.Error as err:
        if err.errno == 1062: # Duplicate entry
            return jsonify({"error": f"Username '{username}' already exists."}), 409
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()


@users_bp.route('/<int:user_id>/toggle-active', methods=['PUT'])
@admin_required
def toggle_user_active_status(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET is_active = NOT is_active WHERE id = %s", (user_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"msg": "User status updated."})

@users_bp.route('/<int:user_id>/password', methods=['PUT'])
@admin_required
def admin_reset_password(user_id):
    data = request.get_json()
    new_password = data.get('password')

    if not new_password:
        return jsonify({"msg": "New password is required"}), 400

    password_hash = generate_password_hash(new_password)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (password_hash, user_id))
        conn.commit()
        if cursor.rowcount == 0:
            return jsonify({"msg": "User not found"}), 404
        return jsonify({"msg": "Password updated successfully"}), 200
    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()

@users_bp.route('/account/password', methods=['PUT'])
@jwt_required()
def change_password():
    current_user = get_jwt_identity()
    user_id = current_user['id']
    data = request.get_json()
    new_password = data.get('password')

    if not new_password:
        return jsonify({"msg": "New password is required"}), 400

    password_hash = generate_password_hash(new_password)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (password_hash, user_id))
        conn.commit()
        return jsonify({"msg": "Password updated successfully"}), 200
    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        cursor.close()
        conn.close()