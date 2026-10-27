# verify-release-apk.ps1 — prove the RELEASE APK is standalone and production-ad-only.

$ErrorActionPreference = 'Continue'

$root = 'D:\arrow-escape-game'
$apk  = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
$work = Join-Path $root 'apk-verify-release'

Write-Output '=== .env.local restored after build? ==='
Write-Output ("  .env.local present : " + (Test-Path (Join-Path $root '.env.local')))
Write-Output ("  .off file present  : " + (Test-Path (Join-Path $root '.env.local.off-for-release-build')))
Write-Output ''

if (-not (Test-Path $apk)) { Write-Output "MISSING APK: $apk"; exit 1 }
$apkItem = Get-Item $apk
Write-Output '=== APK ==='
Write-Output "  path : $($apkItem.FullName)"
Write-Output ("  size : {0:N0} bytes ({1:N1} MB)" -f $apkItem.Length, ($apkItem.Length / 1MB))
Write-Output "  built: $($apkItem.LastWriteTime)"
Write-Output ''

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $work | Out-Null
Push-Location $work
& jar xf $apk 'assets/index.android.bundle' 2>&1 | Out-Null
Pop-Location

$bundle = Join-Path $work 'assets\index.android.bundle'
if (Test-Path $bundle) {
    $bi = Get-Item $bundle
    Write-Output '=== BUNDLE (must be embedded for a standalone APK) ==='
    Write-Output ("  embedded : YES ({0:N0} bytes)" -f $bi.Length)
    $text = [System.IO.File]::ReadAllText($bundle, [System.Text.Encoding]::GetEncoding('latin1'))
    Write-Output ("  expo/virtual/env refs (dev marker) : " + ([regex]::Matches($text, 'expo/virtual/env').Count))
    Write-Output ("  EXPO_PUBLIC_USE_TEST_ADS literal   : " + $text.Contains('EXPO_PUBLIC_USE_TEST_ADS'))
    Write-Output ("  production rewarded unit literal   : " + $text.Contains('ca-app-pub-7288667796446979/9116203924'))
    Write-Output ("  production interstitial unit        : " + $text.Contains('ca-app-pub-7288667796446979/1736619388'))
    Write-Output ("  production banner unit              : " + $text.Contains('ca-app-pub-7288667796446979/7582088414'))
} else {
    Write-Output '=== BUNDLE: NOT EMBEDDED (bad) ==='
}
Write-Output ''

$aapt2 = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Recurse -Filter 'aapt2.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName | Select-Object -Last 1
if ($aapt2) {
    Write-Output '=== MANIFEST ==='
    & $aapt2.FullName dump badging $apk 2>&1 |
        Select-String -Pattern "^package:|^targetSdkVersion:|^application-label:|native-code" |
        ForEach-Object { '  ' + $_.Line }
}
Write-Output ''

$as = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Recurse -Filter 'apksigner.bat' -ErrorAction SilentlyContinue |
    Sort-Object FullName | Select-Object -Last 1
if ($as) {
    Write-Output '=== SIGNATURE ==='
    & $as.FullName verify --print-certs $apk 2>&1 | Select-Object -First 4 | ForEach-Object { '  ' + $_ }
}
