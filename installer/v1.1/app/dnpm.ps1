param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

if (-not $Args -or $Args.Count -eq 0) {
    Write-Host "Usage: .\dnpm.ps1 <npm args>"
    Write-Host "Example: .\dnpm.ps1 install"
    Write-Host "Example: .\dnpm.ps1 run dev"
    exit 1
}

$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerCmd) {
    Write-Error "Docker is not installed or not on PATH. Install Docker Desktop first."
    exit 1
}

& docker compose run --rm npm npm @Args
exit $LASTEXITCODE