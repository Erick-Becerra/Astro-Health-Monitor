<#
  Shares this computer's Astro Health Monitor with teammates on the same network.

  Run it in PowerShell AS ADMINISTRATOR, from the project folder:
      powershell -ExecutionPolicy Bypass -File scripts\share-on-lan.ps1

  What it does:
    1. Finds this computer's LAN IP and writes it to .env as HOST_IP.
    2. Opens inbound ports 5173 (frontend), 8000 (Earth base) and 8001 (space
       station) in Windows Firewall, only for the local subnet.
    3. Tells you which address to give your teammates.

  Undo the firewall rule with:  scripts\share-on-lan.ps1 -Remove
#>
param([switch]$Remove)

$ErrorActionPreference = "Stop"
$ruleName = "Astro Health Monitor (LAN)"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "Open PowerShell as Administrator and run this again." }

if ($Remove) {
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    Write-Host "Firewall rule removed."
    return
}

# The adapter that has a default gateway is the one connected to the network.
$config = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } | Select-Object -First 1
if (-not $config) { throw "No network connection found." }
$ip = $config.IPv4Address.IPAddress

# Write HOST_IP into .env (keep any other lines the file already has).
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
$lines = @()
if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^\s*HOST_IP=' } }
$lines += "HOST_IP=$ip"
Set-Content -Path $envFile -Value $lines -Encoding ascii

# Firewall: ports for the local subnet only, on every network profile
# (hotspots and many Wi-Fi networks are classified as "Public").
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort 5173, 8000, 8001 -RemoteAddress LocalSubnet -Profile Any | Out-Null

Write-Host ""
Write-Host "Done. This computer's address: $ip" -ForegroundColor Green
Write-Host ""
Write-Host "1. Restart the environment so it picks up the address:"
Write-Host "     docker compose up -d --build"
Write-Host "2. Give your teammates:"
Write-Host "     App:             http://${ip}:5173"
Write-Host "     Earth base API:  http://${ip}:8000/docs"
Write-Host "     Station API:     http://${ip}:8001/docs"
Write-Host ""
Write-Host "If your router or hotspot changes your IP, run this script again."
