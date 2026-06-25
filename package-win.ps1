$ErrorActionPreference = "Stop"

$PluginFolderName = "Playhub Metadata"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Parent = Split-Path -Parent $Root
$Version = (Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json).version
$StagingRoot = Join-Path $Root "build-package"
$StagingPlugin = Join-Path $StagingRoot $PluginFolderName
$ProjectFolderName = "Playhub-Metadata_${Version}_Project"
$StagingProject = Join-Path $StagingRoot $ProjectFolderName
$InstallerZip = Join-Path $Parent "Playhub-Metadata_${Version}_Installer.zip"
$ProjectZip = Join-Path $Parent "Playhub-Metadata_${Version}_Project.zip"

$ResolvedRoot = [System.IO.Path]::GetFullPath($Root)
$ResolvedStaging = [System.IO.Path]::GetFullPath($StagingRoot)
if (-not $ResolvedStaging.StartsWith($ResolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to remove staging outside project: $ResolvedStaging"
}

if (Test-Path $StagingRoot) { Remove-Item -LiteralPath $StagingRoot -Recurse -Force }
foreach ($OutputZip in @($InstallerZip, $ProjectZip)) {
  if (Test-Path $OutputZip) { Remove-Item -LiteralPath $OutputZip -Force }
}

New-Item -ItemType Directory -Path $StagingPlugin | Out-Null
New-Item -ItemType Directory -Path (Join-Path $StagingPlugin "dist") | Out-Null

Copy-Item (Join-Path $Root "main.py") $StagingPlugin
Copy-Item (Join-Path $Root "package.json") $StagingPlugin
Copy-Item (Join-Path $Root "plugin.json") $StagingPlugin
Copy-Item (Join-Path $Root "LICENSE") $StagingPlugin
if (Test-Path (Join-Path $Root "NOTICE")) {
  Copy-Item (Join-Path $Root "NOTICE") $StagingPlugin
}
Copy-Item (Join-Path $Root "dist\index.js") (Join-Path $StagingPlugin "dist")
if (Test-Path (Join-Path $Root "dist\index.js.map")) {
  Copy-Item (Join-Path $Root "dist\index.js.map") (Join-Path $StagingPlugin "dist")
}

Compress-Archive -Path (Join-Path $StagingRoot $PluginFolderName) -DestinationPath $InstallerZip -Force

New-Item -ItemType Directory -Path $StagingProject | Out-Null
$ProjectExclude = @("build-package", "node_modules", "__pycache__", "work")
Get-ChildItem -Path $Root -Force | Where-Object {
  $ProjectExclude -notcontains $_.Name
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $StagingProject -Recurse -Force
}

Compress-Archive -Path $StagingProject -DestinationPath $ProjectZip -Force
Remove-Item -LiteralPath $StagingRoot -Recurse -Force

Write-Host "Created $InstallerZip"
Write-Host "Created $ProjectZip"
