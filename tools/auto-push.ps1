# Auto-push SLIMFie: setiap file yang disimpan otomatis di-commit dan di-push ke GitHub,
# lalu GitHub Actions (.github/workflows/main.yml) men-deploy ke hosting lewat FTP.
# Jalankan: powershell -ExecutionPolicy Bypass -File tools/auto-push.ps1
# Berhenti: Ctrl+C
param(
  [int]$Jeda = 10  # detik tanpa perubahan baru sebelum commit, agar beberapa simpan digabung
)

Set-Location (Split-Path $PSScriptRoot -Parent)

# Tanda tangan perubahan: daftar file berubah + waktu simpan terakhirnya.
# Berubah setiap kali file disimpan lagi, walau file yang sama.
function Get-Tanda {
  $baris = @(git status --porcelain)
  if ($baris.Count -eq 0) { return '' }
  $waktu = foreach ($b in $baris) {
    $berkas = $b.Substring(3).Trim('"')
    if ($berkas -match ' -> ') { $berkas = ($berkas -split ' -> ')[-1] }
    if (Test-Path -LiteralPath $berkas) { (Get-Item -LiteralPath $berkas).LastWriteTimeUtc.Ticks }
  }
  return ($baris -join "`n") + '|' + ($waktu -join ',')
}

function Kirim {
  git pull --rebase --autostash --quiet
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[$(Get-Date -Format HH:mm:ss)] Pull gagal (konflik/offline). Selesaikan manual lalu push." -ForegroundColor Red
    return
  }
  git push --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[$(Get-Date -Format HH:mm:ss)] Terkirim ke GitHub, deploy berjalan." -ForegroundColor Green
  } else {
    Write-Host "[$(Get-Date -Format HH:mm:ss)] Push gagal, dicoba lagi nanti." -ForegroundColor Yellow
  }
}

Write-Host "Auto-push aktif di $(Get-Location). Tekan Ctrl+C untuk berhenti." -ForegroundColor Cyan
$tandaLama = ''
$sejak = $null
$cekPush = Get-Date

while ($true) {
  $tanda = Get-Tanda
  if ($tanda -eq '') {
    $tandaLama = ''
    $sejak = $null
  } elseif ($tanda -ne $tandaLama) {
    $tandaLama = $tanda
    $sejak = Get-Date
  } elseif (((Get-Date) - $sejak).TotalSeconds -ge $Jeda) {
    $stempel = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    git add -A
    git commit --quiet -m "auto: $stempel"
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[$(Get-Date -Format HH:mm:ss)] Commit: auto: $stempel"
      Kirim
    }
    $tandaLama = ''
    $sejak = $null
  }

  # Commit yang belum terkirim (mis. tadi offline) dicoba push ulang tiap 60 detik.
  if (((Get-Date) - $cekPush).TotalSeconds -ge 60) {
    $cekPush = Get-Date
    $belum = git rev-list --count '@{u}..HEAD' 2>$null
    if ($belum -and [int]$belum -gt 0) { Kirim }
  }

  Start-Sleep -Seconds 3
}
