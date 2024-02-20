# Define parameters
param(
    [Parameter(Mandatory=$true)]
    [string]$SourcePath,

    [Parameter(Mandatory=$true)]
    [string]$OutputPath
)

# Create a temporary directory
$tempDir = New-Item -ItemType Directory -Path ([System.IO.Path]::GetTempPath()) -Name ([System.IO.Path]::GetRandomFileName())

# Copy all files and directories from the source path to the temporary directory, excluding node_modules
Get-ChildItem -Path $SourcePath -Recurse | Where-Object { $_.FullName -notmatch 'node_modules' } | Copy-Item -Destination { Join-Path $tempDir.FullName $_.FullName.Substring($SourcePath.length) } -Recurse -Force

# Create a zip file from the temporary directory
Compress-Archive -Path "$tempDir\*" -DestinationPath $OutputPath

# Remove the temporary directory
Remove-Item -Path $tempDir -Recurse -Force