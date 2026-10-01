# ui-icons-hub local server (Windows)
# Purpose: start a minimal static server on this machine, to avoid browser restrictions on Service Worker / cache stats under file://.
# Invoked by "UI Icons Hub.cmd"; requires no installed dependencies (only uses PowerShell / .NET built into Windows).
param([int]$PreferredPort = 8899)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$site = Join-Path $root "site"
if (-not (Test-Path $site)) { $site = $root }

$mime = @{
  ".html" = "text/html; charset=utf-8"; ".htm" = "text/html; charset=utf-8";
  ".js"   = "text/javascript; charset=utf-8"; ".mjs" = "text/javascript; charset=utf-8";
  ".css"  = "text/css; charset=utf-8";
  ".json" = "application/json; charset=utf-8"; ".webmanifest" = "application/manifest+json";
  ".svg"  = "image/svg+xml"; ".png" = "image/png"; ".jpg" = "image/jpeg";
  ".jpeg" = "image/jpeg"; ".gif" = "image/gif"; ".webp" = "image/webp"; ".ico" = "image/x-icon";
  ".woff" = "font/woff"; ".woff2" = "font/woff2"; ".ttf" = "font/ttf";
  ".txt"  = "text/plain; charset=utf-8"; ".md" = "text/markdown; charset=utf-8"
}

function Get-FreePort([int]$start) {
  for ($p = $start; $p -lt $start + 40; $p++) {
    $busy = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    if (-not $busy) { return $p }
  }
  return $start + 1000
}

$port = Get-FreePort $PreferredPort
$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

$url = $prefix + "index.html"
Write-Host "ui-icons-hub started: $url"
Write-Host "Data directory: $site"
Write-Host "Close this window to stop the server."
try { Start-Process $url } catch { }

while ($listener.IsListening) {
  $ctx = $null
  try { $ctx = $listener.GetContext() } catch { break }
  if ($null -eq $ctx) { continue }
  $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
  if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
  $file = Join-Path $site $path
  try {
    if ((Test-Path $file) -and (Get-Item $file).PSIsContainer) { $file = Join-Path $file "index.html" }
    if (Test-Path $file) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
      $ctx.Response.ContentType = $ct
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.Headers.Add("Cache-Control", "no-cache")
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    try { $ctx.Response.StatusCode = 500 } catch { }
  }
  try { $ctx.Response.OutputStream.Close() } catch { }
}
