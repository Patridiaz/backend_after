<#
.SYNOPSIS
    Script para construir la imagen e implemantar mediante exportación .tar.gz (Sin cuentas ni registros cloud).
.EXAMPLE
    .\export-image.ps1
#>

Param(
    [string]$Tag = "latest"
)

$ImageName = "backend_after:${Tag}"
$OutputFile = "backend_after.tar.gz"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " 1. Construyendo la imagen $ImageName" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

docker build -t $ImageName .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error al construir la imagen Docker." -ForegroundColor Red
    exit 1
}

Write-Host "=========================================" -ForegroundColor Green
Write-Host " 2. Exportando a $OutputFile" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

docker save $ImageName | gzip > $OutputFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n¡Éxito! Archivo $OutputFile generado." -ForegroundColor Green
    Write-Host "`nInstrucciones para desplegar:" -ForegroundColor Yellow
    Write-Host "1. Copia $OutputFile a la carpeta del servidor mediante Escritorio Remoto o Red." -ForegroundColor Yellow
    Write-Host "2. En el servidor ejecuta:" -ForegroundColor Yellow
    Write-Host "   docker load < backend_after.tar.gz" -ForegroundColor White
    Write-Host "   docker compose up -d" -ForegroundColor White
} else {
    Write-Host "Error al exportar la imagen." -ForegroundColor Red
}
