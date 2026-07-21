<#
.SYNOPSIS
    Script para construir y subir la imagen Docker al Registry (Docker Hub / GHCR).
.EXAMPLE
    .\push-image.ps1 -DockerUser "tu_usuario_docker"
#>

Param(
    [Parameter(Mandatory=$true)]
    [string]$DockerUser,

    [string]$Tag = "latest"
)

$ImageName = "${DockerUser}/backend_after:${Tag}"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " 1. Construyendo la imagen $ImageName" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

docker build -t $ImageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al construir la imagen Docker." -ForegroundColor Red
    exit 1
}

Write-Host "=========================================" -ForegroundColor Green
Write-Host " 2. Subiendo la imagen a Docker Registry" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

docker push $ImageName

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n¡Éxito! La imagen $ImageName fue subida correctamente." -ForegroundColor Green
    Write-Host "`nPara desplegar o actualizar en tu Windows Server 2022:" -ForegroundColor Yellow
    Write-Host "1. Asegúrate de tener DOCKER_IMAGE=$ImageName en tu archivo .env del servidor." -ForegroundColor Yellow
    Write-Host "2. Ejecuta en el servidor:" -ForegroundColor Yellow
    Write-Host "   docker compose pull" -ForegroundColor White
    Write-Host "   docker compose up -d" -ForegroundColor White
} else {
    Write-Host "Error al subir la imagen. Asegúrate de haber iniciado sesión con 'docker login'." -ForegroundColor Red
}
