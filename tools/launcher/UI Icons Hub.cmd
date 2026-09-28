@echo off
chcp 65001 >nul
title UI Icons Hub - UI 图标与设计资源库
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Sta -File "%~dp0serve.ps1"
