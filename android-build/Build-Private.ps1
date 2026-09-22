$ErrorActionPreference = 'Stop'
$privateDir = Join-Path $env:USERPROFILE '.cipherbox-signing\v2'
$credentialPath = Join-Path $privateDir 'keystore-password.xml'
if (!(Test-Path -LiteralPath $credentialPath)) { throw 'Private credentials are missing. Provision the signing key outside this repository first.' }
$secure = Import-Clixml -LiteralPath $credentialPath
$credential = [pscredential]::new('signing', $secure)
try {
    $env:CIPHERBOX_STORE_PASSWORD = $credential.GetNetworkCredential().Password
    $env:CIPHERBOX_KEYSTORE = Join-Path $privateDir 'cipherbox-prod.p12'
    $env:CIPHERBOX_KEY_ALIAS = 'cipherbox-prod'
    node (Join-Path $PSScriptRoot 'build-app.js')
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
} finally {
    Remove-Item Env:\CIPHERBOX_STORE_PASSWORD -ErrorAction SilentlyContinue
}
