import os
import sys
import psycopg
from psycopg import errors, sql
from flask import Flask, send_from_directory, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash
from db import get_db_connection, get_dict_cursor

# Import Blueprints
from routes.shipments import shipments_bp
from routes.models import models_bp
from routes.units import units_bp
from routes.checklist import checklist_bp
from routes.auth import auth_bp
from routes.users import users_bp

load_dotenv()

def get_base_path():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

BASE_PATH = get_base_path()
static_folder_path = os.path.join(BASE_PATH, 'build')

app = Flask(__name__, static_folder=static_folder_path, static_url_path='/')

# More specific CORS configuration
client_origin_url = os.getenv("CLIENT_ORIGIN_URL", "*")
CORS(app, resources={r"/api/*": {"origins": client_origin_url}})

# JWT CONFIG
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "default-secret-for-safety")
app.config["JWT_TOKEN_LOCATION"] = ["headers"]
app.config["JWT_COOKIE_CSRF_PROTECT"] = False
app.config["JWT_CSRF_PROTECT"] = False
jwt = JWTManager(app)

# Register Blueprints
app.register_blueprint(shipments_bp, url_prefix='/api/shipments')
app.register_blueprint(models_bp, url_prefix='/api/models')
app.register_blueprint(units_bp, url_prefix='/api/units')
app.register_blueprint(checklist_bp, url_prefix='/api/checklist')
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(users_bp, url_prefix='/api/users')


@app.cli.command("db-init")
def db_init_command():
    db_name = os.getenv('DB_NAME')
    db_host = os.getenv('DB_HOST')
    db_port = int(os.getenv('DB_PORT', '5432'))
    db_user = os.getenv('DB_USER')
    db_password = os.getenv('DB_PASSWORD')

    print("Ensuring PostgreSQL database exists...")
    try:
        admin_conn = psycopg.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_password,
            dbname="postgres"
        )
        admin_conn.autocommit = True
        with admin_conn.cursor() as admin_cursor:
            admin_cursor.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s",
                (db_name,)
            )
            if admin_cursor.fetchone():
                print(f"Database '{db_name}' already exists.")
            else:
                print(f"Creating database '{db_name}'...")
                admin_cursor.execute(
                    sql.SQL('CREATE DATABASE {}').format(
                        sql.Identifier(db_name)
                    )
                )
                print("Database created successfully.")
    except Exception as err:
        print(f"Failed to ensure database exists: {err}")
        return
    finally:
        if 'admin_conn' in locals() and admin_conn and not admin_conn.closed:
            admin_conn.close()

    print("Connecting to the application database to run schema...")
    conn = get_db_connection()
    if conn is None:
        print("Unable to connect to application database.")
        return
    schema_path = os.path.join(BASE_PATH, 'schema.sql')
    print(f"Reading schema from: {schema_path}")
    try:
        cursor = conn.cursor()
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        cursor.execute(schema_sql)
        conn.commit()
        print("Database tables initialized successfully.")
    except FileNotFoundError:
        print(f"ERROR: schema.sql not found at {schema_path}")
    except Exception as e:
        conn.rollback()
        print(f"An error occurred while running the schema: {e}")
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if conn and not conn.closed:
            conn.close()

@app.cli.command("create-admin")
def create_admin_command():
    import getpass
    username = "admin"
    password = getpass.getpass("Enter password for admin user: ")
    confirm_password = getpass.getpass("Confirm password: ")

    if password != confirm_password:
        print("Passwords do not match. Aborting.")
        return

    if not password:
        print("Password cannot be empty. Aborting.")
        return

    password_hash = generate_password_hash(password)
    print(f"Attempting to create admin user '{username}'...")
    conn = get_db_connection()
    if conn is None:
        print("Unable to connect to the database.")
        return
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (%s, %s, 'admin')",
            (username, password_hash)
        )
        conn.commit()
        print(f"Admin user '{username}' created successfully.")
    except errors.UniqueViolation:
        conn.rollback()
        print(f"Admin user '{username}' already exists.")
    except Exception as e:
        conn.rollback()
        print(f"An unexpected error occurred: {e}")
    finally:
        cursor.close()
        if conn and not conn.closed:
            conn.close()

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')
    
@app.cli.command("reset-password")
def reset_password_command():
    """Resets a user's password."""
    import getpass # A standard library for securely getting password input

    username = input("Enter username of the account to reset: ")
    new_password = getpass.getpass("Enter new password: ")
    confirm_password = getpass.getpass("Confirm new password: ")

    if new_password != confirm_password:
        print("Passwords do not match. Aborting.")
        return
    
    if not new_password:
        print("Password cannot be empty. Aborting.")
        return

    password_hash = generate_password_hash(new_password)
    
    conn = get_db_connection()
    if conn is None:
        print("Unable to connect to the database.")
        return
    try:
        cursor = conn.cursor()
        
        # Check if user exists first
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()

        if not user:
            print(f"Error: User '{username}' not found.")
            return

        cursor.execute(
            "UPDATE users SET password_hash = %s WHERE username = %s",
            (password_hash, username)
        )
        conn.commit()
        print(f"Password for user '{username}' has been reset successfully.")
    except Exception as e:
        conn.rollback()
        print(f"An error occurred: {e}")
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals() and conn and not conn.closed:
            conn.close()

