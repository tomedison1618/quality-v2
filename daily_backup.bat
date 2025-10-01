@echo off
REM ============================================================================
REM Daily MySQL Backup Script
REM ============================================================================

REM --- IMPORTANT: Please update this path to your mysqldump.exe ---

SET MYSQL_DUMP_DIR="C:\wamp64\bin\mysql\mysql9.1.0\bin\"
SET MYSQL_DUMP_PATH=%MYSQL_DUMP_DIR%\mysqldump.exe

REM --- Check if mysqldump.exe exists ---
if not exist %MYSQL_DUMP_PATH% (
    echo ERROR: mysqldump.exe not found at the specified path:
    echo %MYSQL_DUMP_PATH%
    echo Please update the MYSQL_DUMP_PATH variable in this script.
    goto :eof
)

REM --- Database Credentials (from your .env file) ---
REM Load environment variables from backend/.env
for /f "usebackq delims=" %%a in ("backend\.env") do set %%a

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
pushd %MYSQL_DUMP_DIR%
mysqldump.exe -u %DB_USER% -p%DB_PASSWORD% %DB_NAME% > %BACKUP_FILE% 2> %BACKUP_FILE%.log
popd

echo Backup file created successfully:
echo %BACKUP_FILE%
echo.

REM --- Delete backups older than 7 days ---
echo Deleting backups older than 7 days...
forfiles /p %BACKUP_DIR% /s /m *.sql /d -7 /c "cmd /c del @path"
echo.

echo Backup process finished.
echo ============================================================================
