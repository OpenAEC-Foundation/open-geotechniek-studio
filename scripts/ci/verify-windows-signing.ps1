$ErrorActionPreference = 'Stop'
function Assert-Signed([string]$file) {
    if (-not (Test-Path $file)) { throw "Missing signed file: $file" }
    $signature = Get-AuthenticodeSignature $file
    if ($signature.Status -ne 'Valid' -or -not $signature.TimeStamperCertificate) {
        throw "Invalid or untimestamped Authenticode signature: $file"
    }
    Write-Output "$file : $($signature.SignerCertificate.Subject)"
}
$bundle = 'src-tauri/target/release/bundle'
$installers = @(Get-ChildItem "$bundle/nsis/*-setup.exe")
if ($installers.Count -ne 1) { throw 'Expected one NSIS installer' }
Assert-Signed $installers[0].FullName
$installDir = Join-Path $env:RUNNER_TEMP 'geo-signature-check'
$process = Start-Process $installers[0].FullName -ArgumentList @('/S', "/D=$installDir") -PassThru
if (-not $process.WaitForExit(600000)) { $process.Kill(); throw 'Installer timed out' }
if ($process.ExitCode -ne 0) { throw "Installer exited: $($process.ExitCode)" }
try {
    Assert-Signed (Join-Path $installDir 'open-geo-studio.exe')
    Assert-Signed (Join-Path $installDir 'uninstall.exe')
} finally {
    $uninstaller = Join-Path $installDir 'uninstall.exe'
    if (Test-Path $uninstaller) {
        $cleanup = Start-Process $uninstaller -ArgumentList '/S' -PassThru
        if (-not $cleanup.WaitForExit(120000)) { $cleanup.Kill(); throw 'Uninstaller timed out' }
    }
}
