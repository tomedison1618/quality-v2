import psycopg
from psycopg.rows import dict_row
import os
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    try:
        print("\n--- ATTEMPTING DB CONNECTION ---")
        db_host = os.getenv('DB_HOST')
        db_port = os.getenv('DB_PORT', '5432')
        db_user = os.getenv('DB_USER')
        db_pass = os.getenv('DB_PASSWORD')
        db_name = os.getenv('DB_NAME')
        print(f"DEBUG_DB: HOST='{db_host}', PORT='{db_port}', USER='{db_user}', DBNAME='{db_name}'")
        if not all([db_host, db_port, db_user, db_pass, db_name]):
            print("DEBUG_DB: ERROR: DB environment variables are MISSING.")

        conn = psycopg.connect(
            host=db_host,
            port=int(db_port),
            user=db_user,
            password=db_pass,
            dbname=db_name
        )
        print("--- DB CONNECTION SUCCESSFUL ---")
        return conn
    except psycopg.OperationalError as err:
        print(f"!!!!!!!!!! DATABASE CONNECTION FAILED: {err} !!!!!!!!!!")
        return None

def get_dict_cursor(conn):
    """Return a cursor that yields rows as dictionaries."""
    return conn.cursor(row_factory=dict_row)
