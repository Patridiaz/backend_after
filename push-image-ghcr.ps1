<#
.SYNOPSIS
    Script para construir y subir la imagen Docker a GitHub Container Registry (GHCR) sin costos.
.EXAMPLE
    .\push-image-ghcr.ps1 -GithubUser "tu_usuario_github"
#>

Param(
    [Parameter(Mandatory=$true)]
    [string]$GithubUser,

    [string]$Tag = "latest"
)

$ImageName = "ghcr.io/${GithubUser}/backend_after:${Tag}"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " 1. Construyendo la imagen $ImageName" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

docker build -t $ImageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al construir la imagen Docker." -ForegroundColor Red
    exit 1
}

Write-Host "=========================================" -ForegroundColor Green
Write-Host " 2. Subiendo la imagen a GitHub Container Registry (GHCR)" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

docker push $ImageName

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n¡Éxito! La imagen $ImageName fue subida correctamente a GHCR." -ForegroundColor Green
    Write-Host "`nEn tu servidor Windows Server 2022:" -ForegroundColor Yellow
    Write-Host "1. Coloca DOCKER_IMAGE=$ImageName en el .env" -ForegroundColor Yellow
    Write-Host "2. Ejecuta: docker compose pull && docker compose up -d" -ForegroundColor Yellow
} else {
    Write-Host "Error al subir la imagen. Ejecuta antes: docker login ghcr.io -u $GithubUser" -ForegroundColor Red
}
