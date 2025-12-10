@echo off
REM ============================================================================
REM Daily PostgreSQL Backup Script
REM ============================================================================

REM --- IMPORTANT: Update this path to point to your pg_dump.exe installation ---
SET "PG_DUMP_PATH=C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"

REM --- Check if pg_dump.exe exists ---
if not exist "%PG_DUMP_PATH%" (
    echo ERROR: pg_dump.exe not found at the specified path:
    echo %PG_DUMP_PATH%
    echo Please update the PG_DUMP_PATH variable in this script.
    goto :eof
)

REM --- Resolve project paths and load environment variables ---
SET "SCRIPT_DIR=%~dp0"
SET "ENV_FILE=%SCRIPT_DIR%backend\.env"

if not exist "%ENV_FILE%" (
    echo ERROR: backend\.env not found at the expected location:
    echo %ENV_FILE%
    echo Please ensure the repository is intact and try again.
    goto :eof
)

REM Load environment variables from backend\.env (works even when scheduled)
for /f "usebackq delims=" %%a in ("%ENV_FILE%") do set %%a

REM --- Backup Configuration ---
SET "BACKUP_DIR=N:\_Tom\quality backup\db"
SET "FILENAME=%DB_NAME%_backup_%date:~-4,4%-%date:~-10,2%-%date:~-7,2%.sql"
SET "BACKUP_FILE=%BACKUP_DIR%\%FILENAME%"

REM --- Create backup directory if it doesn't exist ---
if not exist "%BACKUP_DIR%" (
    echo Creating backup directory: "%BACKUP_DIR%"
    mkdir "%BACKUP_DIR%"
)

echo ============================================================================
echo Running daily backup for database: '%DB_NAME%'
echo.

REM --- Run the pg_dump command ---
set "PGPASSWORD=%DB_PASSWORD%"
"%PG_DUMP_PATH%" ^
    --host %DB_HOST% ^
    --port %DB_PORT% ^
    --username %DB_USER% ^
    --dbname %DB_NAME% ^
    --file "%BACKUP_FILE%" ^
    --format=plain ^
    --no-owner ^
    --no-privileges
set "PGPASSWORD="

echo Backup file created successfully:
echo %BACKUP_FILE%
echo.

REM --- Delete backups older than 7 days ---
echo Deleting backups older than 7 days...
powershell -NoLogo -NoProfile -Command "Get-ChildItem -Path '%BACKUP_DIR%' -Filter '*.sql' -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Force"
echo.

echo Backup process finished.
echo ============================================================================
