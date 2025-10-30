@echo off

echo Starting Quality V3 Server...
cd /d c:\Apps\quality-v3\backend
echo Activating virtual environment...
call .\venv\Scripts\activate.bat
echo Starting server on http://10.0.10.84:5000
waitress-serve --host 10.0.10.84 --port 5000 run:app
