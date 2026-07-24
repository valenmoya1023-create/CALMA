@echo off
cd /d "%~dp0"
start "" http://localhost:8000
npx --yes serve -l 8000
