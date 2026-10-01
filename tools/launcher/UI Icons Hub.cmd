@echo off
chcp 65001 >nul
title UI Icons Hub - UI Icons and Design Resource Library
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Sta -File "%~dp0serve.ps1"
