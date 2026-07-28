<#
.SYNOPSIS
  Let your phone reach the Expo dev server on this PC.

.DESCRIPTION
  Two things on this machine stop Expo Go connecting over the local network:

    1. Windows Firewall has enabled *Block* rules for inbound node.exe. These are
       created when someone clicks "Cancel" on the "Allow Node.js to communicate
       on these networks?" popup. Once a Block rule exists, Windows never asks
       again -- it just silently refuses every connection.

    2. The Ethernet adapter is categorised as a Public network, and Windows
       applies its strictest inbound defaults there.

  This script removes the block rules, opens the Metro ports, and moves Ethernet
  to Private. It changes nothing else.

  Why bother instead of using the tunnel: the development bundle is about 10 MB.
  Over the local network that is instant. Over an ngrok tunnel it is slow enough
  that Expo Go often gives up, which is the "Failed to download remote update"
  error.

.NOTES
  Must run elevated. Right-click the file and choose "Run with PowerShell" as
  administrator, or see the one-liner in docs/TESTING.md.
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'

Write-Host ''
Write-Host 'ArrowPath - dev network fix' -ForegroundColor Cyan
Write-Host ('-' * 40)

# --- 1. Remove the inbound Block rules for Node -----------------------------
$blocked = Get-NetFirewallRule -Direction Inbound -Action Block -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like '*Node.js*' }

if ($blocked) {
  foreach ($rule in $blocked) {
    Remove-NetFirewallRule -Name $rule.Name
    Write-Host ("  removed block rule: {0} [{1}]" -f $rule.DisplayName, $rule.Profile) -ForegroundColor Yellow
  }
} else {
  Write-Host '  no Node block rules found' -ForegroundColor DarkGray
}

# --- 2. Open the Metro ports ------------------------------------------------
# 8081 is Metro's default; 19000-19001 are Expo's dev tooling ports.
$ruleName = 'Expo dev server (Metro)'
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule `
  -DisplayName $ruleName `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 8081, 8082, 19000, 19001 `
  -Action Allow `
  -Profile Any | Out-Null
Write-Host '  opened TCP 8081, 8082, 19000, 19001' -ForegroundColor Green

# --- 3. Move real networks off the Public profile ---------------------------
$profiles = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -eq 'Internet' }
foreach ($p in $profiles) {
  if ($p.NetworkCategory -eq 'Public') {
    Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private
    Write-Host ("  {0}: Public -> Private" -f $p.InterfaceAlias) -ForegroundColor Green
  } else {
    Write-Host ("  {0}: already {1}" -f $p.InterfaceAlias, $p.NetworkCategory) -ForegroundColor DarkGray
  }
}

# --- 4. Report the address the phone must reach -----------------------------
Write-Host ''
$addresses = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }

if (-not $addresses) {
  Write-Host 'No usable LAN address found. Every adapter is either loopback or' -ForegroundColor Red
  Write-Host 'has failed to get a DHCP lease (a 169.254.x.x address). Fix the' -ForegroundColor Red
  Write-Host 'network connection first, or fall back to: npm run start:tunnel' -ForegroundColor Red
  exit 1
}

Write-Host 'Done. Your phone must be on the same network as one of these:' -ForegroundColor Cyan
foreach ($a in $addresses) {
  Write-Host ("  {0}  ({1})" -f $a.IPAddress, $a.InterfaceAlias) -ForegroundColor White
}

Write-Host ''
Write-Host 'Now run  npm start  and scan the QR code with Expo Go.' -ForegroundColor Cyan
Write-Host 'Check your phone has an address on the same subnet:' -ForegroundColor DarkGray
Write-Host '  Settings -> Wi-Fi -> (your network) -> IP address' -ForegroundColor DarkGray
Write-Host ''
