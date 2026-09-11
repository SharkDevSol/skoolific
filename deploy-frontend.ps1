param(
    [string]$SshHost = "76.13.48.245",
    [string]$SshUser = "root",
    [string]$SshPass = "s_gR(jTGqfrWI)t6k59c_&b3",
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'

$AppDir = Join-Path $PSScriptRoot 'APP'
$SiteRoot = '/var/www/iqra.skoolific.com/APP'

Write-Host '=== 1/4 Build ==='
if (-not $SkipBuild) {
    Push-Location $AppDir
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm build failed' }
    Pop-Location
}

Write-Host '=== 2/4 Package ==='
$ts = Get-Date -Format 'yyyyMMddHHmmss'
$archive = Join-Path $env:TEMP "dist-$ts.tar.gz"
tar -czf $archive -C $AppDir dist
Write-Host "Archive: $archive ($([math]::Round((Get-Item $archive).Length/1MB,2)) MB)"

Write-Host '=== 3/4 Upload (retries until server reachable, max 20 min) ==='
$uploaded = $false
$deadline = (Get-Date).AddMinutes(20)
while (-not $uploaded -and (Get-Date) -lt $deadline) {
    $tcp = Test-NetConnection -ComputerName $SshHost -Port 22 -WarningAction SilentlyContinue
    if ($tcp.TcpTestSucceeded) {
        Write-Host "port 22 open - uploading..."
        & pscp -batch -pw $SshPass "$archive" "${SshUser}@${SshHost}:/tmp/deploy-dist.tar.gz" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { $uploaded = $true } else { Write-Host 'upload failed, retrying in 15s'; Start-Sleep -Seconds 15 }
    } else {
        Write-Host "server not reachable at $(Get-Date -Format HH:mm:ss), retrying in 15s"
        Start-Sleep -Seconds 15
    }
}
if (-not $uploaded) { throw 'Upload failed: server unreachable after 20 minutes' }

Write-Host '=== 4/4 Atomic swap + verify + rollback ==='
$remote = @'
set -e
cd /var/www/iqra.skoolific.com/APP
rm -rf dist-staging && mkdir dist-staging
tar -xzf /tmp/deploy-dist.tar.gz -C dist-staging --strip-components=1
if [ ! -f dist-staging/index.html ]; then echo "FAIL: index.html missing in staging"; exit 1; fi
if ! ls dist-staging/assets/index-*.js >/dev/null 2>&1; then echo "FAIL: JS bundle missing in staging"; exit 1; fi
rm -rf dist-old
[ -d dist ] && mv dist dist-old
mv dist-staging dist
rm -rf dist-old
sleep 1
code=$(curl -sk -H 'Host: iqra.skoolific.com' -o /dev/null -w '%{http_code}' https://127.0.0.1/tasks || true)
if [ "$code" != "200" ]; then
  echo "FAIL: /tasks returned $code - rolling back"
  rm -rf dist
  [ -d dist-old ] && mv dist-old dist
  exit 1
fi
echo "DEPLOY OK: /tasks -> $code"
'@
$remote | plink -batch -pw $SshPass "${SshUser}@${SshHost}" "bash -s"
if ($LASTEXITCODE -ne 0) { throw 'Remote deploy failed' }

Write-Host "Deployed: $archive"