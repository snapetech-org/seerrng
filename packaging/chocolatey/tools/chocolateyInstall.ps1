$ErrorActionPreference = 'Stop'

$packageName = 'seerrng'
$version = '__VERSION__'
$sha256 = '__SHA256__'
$serviceName = 'SeerrNG'
$releaseTag = "v$version"
$archiveName = "seerrng-$releaseTag-windows-x64.zip"
$archiveUrl = "https://github.com/snapetech-org/seerrng/releases/download/$releaseTag/$archiveName"
$applicationRoot = Join-Path $env:ProgramData 'SeerrNG\applications'
$versionRoot = Join-Path $applicationRoot $version
$applicationDirectory = Join-Path $versionRoot "seerrng-$releaseTag-windows-x64"
$configDirectory = Join-Path $env:ProgramData 'SeerrNG\config'

$nativeArchitecture = $env:PROCESSOR_ARCHITEW6432
if ([string]::IsNullOrWhiteSpace($nativeArchitecture)) {
  $nativeArchitecture = $env:PROCESSOR_ARCHITECTURE
}
if ($nativeArchitecture -ne 'AMD64') {
  throw "The SeerrNG Chocolatey package supports Windows x64 only. Detected $nativeArchitecture."
}

if ($sha256 -notmatch '^[a-f0-9]{64}$') {
  throw 'The package does not contain a valid SHA-256 checksum for the release archive.'
}

$node = Get-Command 'node.exe' -ErrorAction Stop
$nssm = Get-Command 'nssm.exe' -ErrorAction Stop
$nodePath = $node.Definition
$nssmPath = $nssm.Definition
$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($null -ne $service) {
  & $nssmPath get $serviceName Application > $null 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "A service named $serviceName already exists and is not managed by NSSM. It was left unchanged."
  }
}

New-Item -ItemType Directory -Path $applicationRoot -Force | Out-Null
New-Item -ItemType Directory -Path $versionRoot -Force | Out-Null
New-Item -ItemType Directory -Path $configDirectory -Force | Out-Null

Install-ChocolateyZipPackage `
  -PackageName $packageName `
  -Url $archiveUrl `
  -Url64bit $archiveUrl `
  -UnzipLocation $versionRoot `
  -Checksum $sha256 `
  -ChecksumType 'sha256' `
  -Checksum64 $sha256 `
  -ChecksumType64 'sha256'

if (-not (Test-Path -LiteralPath (Join-Path $applicationDirectory 'dist\index.js'))) {
  throw "The downloaded SeerrNG archive did not contain the expected application files at $applicationDirectory."
}

function Invoke-Nssm {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  & $nssmPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "NSSM failed while running: $($Arguments -join ' ') (exit code $LASTEXITCODE)."
  }
}

if ($null -ne $service) {
  if ($service.Status -ne 'Stopped') {
    Stop-Service -Name $serviceName -Force
    $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
  }
} else {
  Invoke-Nssm @('install', $serviceName, $nodePath, 'dist\index.js')
}

Invoke-Nssm @('set', $serviceName, 'Application', $nodePath)
Invoke-Nssm @('set', $serviceName, 'AppDirectory', $applicationDirectory)
Invoke-Nssm @('set', $serviceName, 'AppParameters', 'dist\index.js')
Invoke-Nssm @(
  'set',
  $serviceName,
  'AppEnvironmentExtra',
  'NODE_ENV=production',
  "CONFIG_DIRECTORY=$configDirectory",
  'PORT=5055',
  'HOST=0.0.0.0'
)
Invoke-Nssm @('set', $serviceName, 'AppExit', 'Default', 'Restart')
Invoke-Nssm @('set', $serviceName, 'AppRestartDelay', '5000')
Invoke-Nssm @('set', $serviceName, 'DisplayName', 'SeerrNG')
Invoke-Nssm @('set', $serviceName, 'Description', 'SeerrNG media request and discovery server')
Invoke-Nssm @('set', $serviceName, 'Start', 'SERVICE_AUTO_START')

$icacls = Join-Path $env:WINDIR 'System32\icacls.exe'
& $icacls $configDirectory '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '/T' '/C' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not restrict access to the SeerrNG configuration directory at $configDirectory."
}

Start-Service -Name $serviceName
$service = Get-Service -Name $serviceName
$service.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))

Get-ChildItem -LiteralPath $applicationRoot -Force |
  Where-Object { $_.PSIsContainer } |
  Where-Object { $_.Name -ne $version } |
  ForEach-Object {
    if (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing to remove an unexpected reparse point from the SeerrNG application directory: $($_.FullName)"
    }
    Remove-Item -LiteralPath $_.FullName -Recurse -Force
  }

Write-Host "SeerrNG $version is installed as the $serviceName service. Configuration is stored in $configDirectory."
