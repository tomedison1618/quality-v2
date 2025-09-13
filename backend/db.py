import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    try:
        print("\n--- ATTEMPTING DB CONNECTION ---")
        db_host = os.getenv('DB_HOST')
        db_user = os.getenv('DB_USER')
        db_pass = os.getenv('DB_PASSWORD')
        db_name = os.getenv('DB_NAME')
        print(f"DEBUG_DB: HOST='{db_host}', USER='{db_user}', DBNAME='{db_name}'")
        if not all([db_host, db_user, db_pass, db_name]):
            print("DEBUG_DB: ERROR: DB environment variables are MISSING.")

        conn = mysql.connector.connect(
            host=db_host,
            user=db_user,
            password=db_pass,
            database=db_name
        )
        print("--- DB CONNECTION SUCCESSFUL ---")
        return conn
    except mysql.connector.Error as err:
        print(f"!!!!!!!!!! DATABASE CONNECTION FAILED: {err} !!!!!!!!!!")
        return None