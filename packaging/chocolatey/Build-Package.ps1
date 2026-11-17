param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?$')]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-fA-F0-9]{64}$')]
  [string]$ArchiveSha256,

  [string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist')
)

$ErrorActionPreference = 'Stop'

$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "seerrng-chocolatey-$([Guid]::NewGuid().ToString('N'))"

try {
  New-Item -ItemType Directory -Path (Join-Path $stagingDirectory 'tools') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'seerrng.nuspec') -Destination $stagingDirectory
  Copy-Item -Path (Join-Path $PSScriptRoot 'tools\*') -Destination (Join-Path $stagingDirectory 'tools') -Recurse -Force

  $nuspecPath = Join-Path $stagingDirectory 'seerrng.nuspec'
  $nuspec = [System.IO.File]::ReadAllText($nuspecPath)
  $nuspec = $nuspec.Replace('__VERSION__', $Version)
  [xml]$manifest = $nuspec
  $licensePath = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'LICENSE'
  $licenseCopyright = Get-Content -LiteralPath $licensePath | Where-Object { $_ -match '^Copyright ' } | Select-Object -First 1
  if (-not $licenseCopyright -or $manifest.package.metadata.copyright -cne $licenseCopyright) {
    throw 'Chocolatey copyright must match the repository LICENSE.'
  }
  $authors = @($manifest.package.metadata.authors.Split(',') | ForEach-Object { $_.Trim() })
  if ($authors -notcontains 'sct' -or $authors -notcontains 'Seerr contributors') {
    throw 'Chocolatey authors must credit sct and the Seerr contributors.'
  }
  if ($manifest.package.metadata.description -notmatch '\bfork of Seerr\b') {
    throw 'Chocolatey description must identify SeerrNG as a fork of Seerr.'
  }
  [System.IO.File]::WriteAllText($nuspecPath, $nuspec)

  $installPath = Join-Path $stagingDirectory 'tools\chocolateyInstall.ps1'
  $installScript = [System.IO.File]::ReadAllText($installPath)
  $installScript = $installScript.Replace('__VERSION__', $Version)
  $installScript = $installScript.Replace('__SHA256__', $ArchiveSha256.ToLowerInvariant())
  [System.IO.File]::WriteAllText($installPath, $installScript)

  if ($nuspec.Contains('__VERSION__') -or $installScript.Contains('__VERSION__') -or $installScript.Contains('__SHA256__')) {
    throw 'The Chocolatey package still contains unresolved release placeholders.'
  }

  & choco pack $nuspecPath "--outputdirectory=$outputPath"
  if ($LASTEXITCODE -ne 0) {
    throw "choco pack failed with exit code $LASTEXITCODE."
  }

  $packagePath = Join-Path $outputPath "seerrng.$Version.nupkg"
  if (-not (Test-Path -LiteralPath $packagePath)) {
    throw "choco pack did not create the expected package at $packagePath."
  }

  Write-Output $packagePath
} finally {
  if (Test-Path -LiteralPath $stagingDirectory) {
    Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
  }
}
