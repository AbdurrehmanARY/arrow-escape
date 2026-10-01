# build-test-apk.ps1
#
# Purpose: produce a standalone, installable DEBUG APK that serves Google's TEST
#          ad units, for testing on a physical Android device.
#
# Why a script: three environment facts must all be true at once or the build
# fails in confusing ways, and remembering them by hand is how the "app asks for
# a Metro dev server" APK got shipped twice.
#   1. JAVA_HOME must be JDK 17. Android Studio's bundled JBR is JDK 25, which the
#      Kotlin 2.1.20 compiler rejects.
#   2. ANDROID_HOME / android/local.properties must point at a real SDK. `expo
#      prebuild` rewrites local.properties with an empty `sdk.dir=`.
#   3. EXPO_PUBLIC_USE_TEST_ADS must be true. `debuggableVariants = []` makes the
#      debug variant bundle with `--dev false`, so `__DEV__` is false inside the
#      APK and test ads would otherwise be off.
#
# Notes: The JS bundle is embedded by `debuggableVariants = []`, injected by
#        plugins/withStandaloneDebugBundling.js. Without it the debug APK expects
#        a Metro server and opens on a "fetch development server" screen.

$ErrorActionPreference = 'Continue'

$root    = 'D:\arrow-escape-game'
$logFile = Join-Path $root 'build-test-apk.log'

$env:JAVA_HOME               = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot'
$env:ANDROID_HOME            = 'C:\Users\ARY\AppData\Local\Android\Sdk'
$env:ANDROID_SDK_ROOT        = 'C:\Users\ARY\AppData\Local\Android\Sdk'
$env:EXPO_PUBLIC_USE_TEST_ADS = 'true'

Remove-Item $logFile -ErrorAction SilentlyContinue
Remove-Item (Join-Path $root 'build-test-apk.done') -ErrorAction SilentlyContinue

Set-Location (Join-Path $root 'android')

& .\gradlew.bat app:assembleDebug 2>&1 | Tee-Object -FilePath $logFile | Out-Null

$exit = $LASTEXITCODE
"EXIT=$exit" | Out-File -FilePath $logFile -Append -Encoding utf8
"EXIT=$exit" | Out-File -FilePath (Join-Path $root 'build-test-apk.done') -Encoding utf8
