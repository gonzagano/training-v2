param([string]$Profile)
# Cierra todos los procesos de Edge/Chrome que usan el perfil temporal indicado.
Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and $_.CommandLine -like "*$Profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
