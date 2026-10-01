# verify-apk.ps1 — prove the built APK is the standalone test build we intended.
#
# Checks, in order of what actually matters:
#   1. assets/index.android.bundle is EMBEDDED  → no Metro dev server needed.
#   2. EXPO_PUBLIC_USE_TEST_ADS was INLINED      → test ad units are selected.
#   3. manifest package / versionCode / versionName.
#   4. the APK verifies against its signing certificate.

$ErrorActionPreference = 'Continue'

$root = 'D:\arrow-escape-game'
$apk  = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
$work = Join-Path $root 'apk-verify'

if (-not (Test-Path $apk)) { Write-Output "MISSING APK: $apk"; exit 1 }

$apkItem = Get-Item $apk
Write-Output "APK path    : $($apkItem.FullName)"
Write-Output ("APK size    : {0:N0} bytes ({1:N1} MB)" -f $apkItem.Length, ($apkItem.Length / 1MB))
Write-Output "APK built   : $($apkItem.LastWriteTime)"
Write-Output ''

# --- 1 & 2: extract the JS bundle from the APK and inspect it -----------------
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $work | Out-Null
Push-Location $work
& jar xf $apk 'assets/index.android.bundle' 2>&1 | Out-Null
Pop-Location

$bundle = Join-Path $work 'assets\index.android.bundle'
if (Test-Path $bundle) {
    $bundleItem = Get-Item $bundle
    Write-Output "1. BUNDLE EMBEDDED      : YES  ($('{0:N0}' -f $bundleItem.Length) bytes)"
    Write-Output "   -> APK runs standalone; it does NOT need a Metro dev server."

    $text = Get-Content $bundle -Raw -Encoding utf8

    $leftLiteral = $text -match 'EXPO_PUBLIC_USE_TEST_ADS'
    Write-Output ''
    Write-Output "2. EXPO_PUBLIC_USE_TEST_ADS left as runtime lookup : $leftLiteral"
    if ($leftLiteral) {
        Write-Output "   -> WARNING: the var was NOT inlined, so test ads may be OFF."
    } else {
        Write-Output "   -> INLINED, so USE_TEST_ADS evaluated truthy at build time (test ad units)."
    }

    Write-Output ("   test-ad unit prefix 3940256099942544 present      : " + ($text -match '3940256099942544'))
    Write-Output ("   prod unit prefix    1159231009656865 present      : " + ($text -match '1159231009656865'))
} else {
    Write-Output '1. BUNDLE EMBEDDED      : NO  <-- APK would ask for a dev server!'
}
Write-Output ''

# --- 3: manifest ---------------------------------------------------------------
$aapt2 = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Recurse -Filter 'aapt2.exe' -ErrorAction SilentlyContinue |
    Sort-Object FullName | Select-Object -Last 1
if ($aapt2) {
    Write-Output "3. MANIFEST (aapt2 $($aapt2.Directory.Name))"
    & $aapt2.FullName dump badging $apk 2>&1 |
        Select-String -Pattern "^package:|^sdkVersion:|^targetSdkVersion:|^application-label:|native-code" |
        ForEach-Object { '   ' + $_.Line }
} else {
    Write-Output '3. MANIFEST: aapt2 not found'
}
Write-Output ''

# --- 4: signature -------------------------------------------------------------
Write-Output '4. SIGNATURE (jarsigner)'
$sig = & jarsigner -verify $apk 2>&1 | Select-Object -First 4
$sig | ForEach-Object { '   ' + $_ }
