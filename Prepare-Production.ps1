param(
  [string]$OutputDirectory = 'dist-production'
)

$ErrorActionPreference = 'Stop'
$sourcePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'site-package'))
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory, $PSScriptRoot)
$separator = [System.IO.Path]::DirectorySeparatorChar

if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) {
  throw "Static site package not found: $sourcePath"
}
if ($outputPath -eq $sourcePath -or $outputPath.StartsWith($sourcePath.TrimEnd($separator) + $separator, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Output directory cannot be inside site-package.'
}
if (Test-Path -LiteralPath $outputPath) {
  throw "Output directory already exists; choose a new path to avoid overwriting files: $outputPath"
}

$supabaseUrl = $env:GROWTHER_PROD_SUPABASE_URL
$publishableKey = $env:GROWTHER_PROD_SUPABASE_PUBLISHABLE_KEY
$privacyUrl = $env:GROWTHER_PRIVACY_URL
if (-not $supabaseUrl -or -not $publishableKey) {
  throw 'Set GROWTHER_PROD_SUPABASE_URL and GROWTHER_PROD_SUPABASE_PUBLISHABLE_KEY in the current PowerShell session first.'
}

$parsedUrl = $null
if (-not [System.Uri]::TryCreate($supabaseUrl, [System.UriKind]::Absolute, [ref]$parsedUrl) -or
    $parsedUrl.Scheme -ne 'https' -or
    -not $parsedUrl.Host.EndsWith('.supabase.co', [System.StringComparison]::OrdinalIgnoreCase) -or
    $parsedUrl.AbsolutePath -ne '/' -or $parsedUrl.Query -or $parsedUrl.Fragment) {
  throw 'GROWTHER_PROD_SUPABASE_URL must be the HTTPS project URL, such as https://your-project.supabase.co.'
}
if ($publishableKey -notmatch '^sb_publishable_[A-Za-z0-9_-]+$') {
  throw 'GROWTHER_PROD_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key (sb_publishable_...). Never use a secret/service-role key here.'
}
if ($privacyUrl) {
  $parsedPrivacyUrl = $null
  if (-not [System.Uri]::TryCreate($privacyUrl, [System.UriKind]::Absolute, [ref]$parsedPrivacyUrl) -or
      $parsedPrivacyUrl.Scheme -ne 'https' -or $parsedPrivacyUrl.Query -or $parsedPrivacyUrl.Fragment) {
    throw 'GROWTHER_PRIVACY_URL must be a public HTTPS URL without a query string or fragment.'
  }
}

New-Item -ItemType Directory -Path $outputPath | Out-Null
foreach ($item in @('index.html', 'meal-scanner.js', 'meal-scanner.css', 'service-worker.js', 'manifest.webmanifest', 'icons', 'assets')) {
  $sourceItem = Join-Path $sourcePath $item
  if (-not (Test-Path -LiteralPath $sourceItem)) {
    throw "Required production file is missing: $sourceItem"
  }
  Copy-Item -LiteralPath $sourceItem -Destination $outputPath -Recurse
  if ($item -eq 'assets') {
    Get-ChildItem -LiteralPath (Join-Path $outputPath 'assets') -Recurse -File -Filter '*.png' | Remove-Item -Force
  }
}

$config = @"
// Generated for this production build. Supabase publishable keys are public by design.
// Never add a Supabase secret/service-role key to this file.
window.GA_SUPABASE_URL = '$supabaseUrl';
window.GA_SUPABASE_PUBLISHABLE_KEY = '$publishableKey';
window.GROWTHER_PRIVACY_URL = '$privacyUrl';
"@
$configPath = Join-Path $outputPath 'supabase-config.js'
[System.IO.File]::WriteAllText($configPath, $config, [System.Text.UTF8Encoding]::new($false))

Write-Output "Production static package prepared at: $outputPath"
Write-Output 'This script does not deploy the site, apply database migrations, or upload user data.'
