@echo off

echo Waiting for WAMP to initialize...
echo timeout /t 10 /nobreak > NUL

echo Starting Quality V2 Server...
cd c:\Apps\quality-v2\backend
echo Activating virtual environment...
call .\venv\Scripts\activate.bat
echo Starting server on http://10.0.10.84:5000
waitress-serve --host 10.0.10.84 --port 5000 run:app
