# build-release-apk.ps1
#
# Purpose: build the standalone RELEASE APK from the current source, with AdMob
#          wired to the PRODUCTION ad unit ids.
#
# Why the .env.local shuffle: a release build has `__DEV__ === false`, but our
# test build enables the opt-in `EXPO_PUBLIC_USE_TEST_ADS=true` override which
# lives in gitignored `.env.local`. Left in place, that override would be inlined
# into the release bundle too and the release APK would serve *test* ads. So the
# file is moved aside for the duration of this build and restored in `finally`,
# even if the build fails.
#
# Why the daemon kill: a Gradle daemon keeps the environment of whichever client
# started it. The preceding test-ads build left a daemon holding
# `EXPO_PUBLIC_USE_TEST_ADS=true`, and a reused daemon would leak it straight into
# this build's Metro invocation. Every `java.exe` is killed before starting.
#
# Notes: `android/local.properties` is rewritten with an empty `sdk.dir=` by
#        `expo prebuild`, so the SDK is passed via ANDROID_HOME here as well.

$ErrorActionPreference = 'Continue'

$root    = 'D:\arrow-escape-game'
$logFile = Join-Path $root 'build-release-apk.log'
$doneFile = Join-Path $root 'build-release-apk.done'
$envFile = Join-Path $root '.env.local'
$envOff  = Join-Path $root '.env.local.off-for-release-build'

$env:JAVA_HOME        = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot'
$env:ANDROID_HOME     = 'C:\Users\ARY\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'C:\Users\ARY\AppData\Local\Android\Sdk'
Remove-Item Env:\EXPO_PUBLIC_USE_TEST_ADS -ErrorAction SilentlyContinue

Remove-Item $logFile -ErrorAction SilentlyContinue
Remove-Item $doneFile -ErrorAction SilentlyContinue

# --- hide the test-ads override -------------------------------------------------
$moved = $false
if (Test-Path $envFile) {
    Move-Item $envFile $envOff -Force
    $moved = $true
}

try {
    # A stale daemon would carry the old EXPO_PUBLIC_USE_TEST_ADS into this build.
    Get-Process -Name java -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    Set-Location (Join-Path $root 'android')
    & .\gradlew.bat app:assembleRelease 2>&1 | Tee-Object -FilePath $logFile | Out-Null

    $exit = $LASTEXITCODE
    "EXIT=$exit" | Out-File -FilePath $logFile -Append -Encoding utf8
    "EXIT=$exit" | Out-File -FilePath $doneFile -Encoding utf8
}
finally {
    if ($moved) { Move-Item $envOff $envFile -Force }
}
