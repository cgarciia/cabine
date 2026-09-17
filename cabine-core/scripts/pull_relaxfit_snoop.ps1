# Captura o HCI snoop do tablet depois de uma pesagem no RelaxFit.
# 1) Pare a Cabine (API/backend) — a balança só fala com um app por vez.
# 2) Confirme snoop FULL, meça no RelaxFit até sair o relatório.
# 3) Rode este script no PowerShell com o tablet no USB.

$ErrorActionPreference = "Stop"
$outDir = Join-Path $env:USERPROFILE "Desktop\relaxfit-snoop"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "Dispositivos:"
adb devices

$mode = adb shell settings get global bluetooth_btsnoop_default_mode
Write-Host "bluetooth_btsnoop_default_mode = $mode"
if ($mode.Trim() -ne "full") {
    Write-Host "Ligando snoop FULL e reiniciando Bluetooth..."
    adb shell settings put global bluetooth_btsnoop_default_mode full
    adb shell cmd bluetooth_manager disable
    Start-Sleep -Seconds 2
    adb shell settings put global bluetooth_btsnoop_default_mode full
    adb shell cmd bluetooth_manager enable
    Write-Host "Agora meça no RelaxFit e rode o script de novo para puxar o bugreport."
    exit 0
}

$zip = Join-Path $outDir ("bugreport-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".zip")
Write-Host "Gerando bugreport (pode levar alguns minutos) -> $zip"
adb bugreport $zip

Write-Host "Pronto. Envie este ZIP (ou o btsnoop extraído) para análise."
Write-Host "Caminho típico dentro do zip: FS\data\log\bt\btsnoop_hci.log"
Write-Host "Parser: uv run python scripts/parse_btsnoop_icomon.py CAMINHO\btsnoop_hci.log"
