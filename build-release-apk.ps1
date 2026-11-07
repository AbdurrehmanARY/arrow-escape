# build-release-apk.ps1
#
# Purpose: build the standalone RELEASE APK from the current source, with AdMob
#          wired to the PRODUCTION ad unit ids.
#

# Notes: `android/local.properties` is rewritten with an empty `sdk.dir=` by
#        `expo prebuild`, so the SDK is passed via ANDROID_HOME here as well.

$ErrorActionPreference = 'Continue'

$root    = 'D:\arrow-escape-game'
$logFile = Join-Path $root 'build-release-apk.log'
$doneFile = Join-Path $root 'build-release-apk.done'

$env:JAVA_HOME        = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot'
$env:ANDROID_HOME     = 'C:\Users\ARY\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT = 'C:\Users\ARY\AppData\Local\Android\Sdk'


Remove-Item $logFile -ErrorAction SilentlyContinue
Remove-Item $doneFile -ErrorAction SilentlyContinue


try {
    Set-Location (Join-Path $root 'android')
    & .\gradlew.bat app:assembleRelease 2>&1 | Tee-Object -FilePath $logFile | Out-Null

    $exit = $LASTEXITCODE
    "EXIT=$exit" | Out-File -FilePath $logFile -Append -Encoding utf8
    "EXIT=$exit" | Out-File -FilePath $doneFile -Encoding utf8
}
