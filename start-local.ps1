$ErrorActionPreference = "Stop"

$tomcatHome = "C:\Program Files\Apache Software Foundation\Tomcat 9.0"
$tomcatStartup = Join-Path $tomcatHome "bin\startup.bat"
$geoServerHealth = "http://localhost:8080/geoserver/ows?service=WFS&request=GetCapabilities"

function Test-Url($url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $url -TimeoutSec 6
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  }
  catch {
    return $false
  }
}

if (-not (Test-Url $geoServerHealth)) {
  if (-not (Test-Path $tomcatStartup)) {
    throw "No se encontro startup.bat de Tomcat en: $tomcatStartup"
  }

  $env:CATALINA_HOME = $tomcatHome
  $env:CATALINA_BASE = $tomcatHome
  & $tomcatStartup
  Write-Host "Tomcat iniciado manualmente."
}
else {
  Write-Host "GeoServer ya esta activo en localhost:8080."
}

$env:GEOSERVER_BASE = "http://localhost:8080"
Write-Host "Iniciando visor + proxy en http://localhost:5500 ..."
python .\serve_proxy.py
