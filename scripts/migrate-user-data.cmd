@echo off
rem Cyrene user data migration entry point. Double-click to run.
rem Keep this file ASCII-only: cmd.exe reads BOM-less files with the system
rem ANSI codepage, and non-ASCII bytes here can break parsing on some machines.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0migrate-user-data.ps1"
pause
