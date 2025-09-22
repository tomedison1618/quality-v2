@echo off
REM ============================================================================
REM Daily MySQL Backup Script
REM ============================================================================

REM --- IMPORTANT: Please update this path to your mysqldump.exe ---
SET MYSQL_DUMP_PATH="C:\wamp64\bin\mysql\mysql8.0.33\bin\mysqldump.exe"

REM --- Database Credentials (from your .env file) ---
SET DB_USER=factory_user
SET DB_PASS=password
SET DB_NAME=quality

REM --- Backup Configuration ---
SET BACKUP_DIR="N:\_Tom\quality backup\db"
SET FILENAME=%DB_NAME%_backup_%date:~-4,4%-%date:~-10,2%-%date:~-7,2%.sql
SET BACKUP_FILE=%BACKUP_DIR%\%FILENAME%

REM --- Create backup directory if it doesn't exist ---
if not exist %BACKUP_DIR% (
    echo Creating backup directory: %BACKUP_DIR%
    mkdir %BACKUP_DIR%
)

echo ============================================================================
echo Running daily backup for database: '%DB_NAME%'
echo.

REM --- Run the mysqldump command ---
%MYSQL_DUMP_PATH% -u %DB_USER% -p%DB_PASS% %DB_NAME% > %BACKUP_FILE%

echo Backup file created successfully:
echo %BACKUP_FILE%
echo.

REM --- Delete backups older than 7 days ---
echo Deleting backups older than 7 days...
forfiles /p %BACKUP_DIR% /s /m *.sql /d -7 /c "cmd /c del @path"
echo.

echo Backup process finished.
echo ============================================================================
