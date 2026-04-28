param(
    [switch]$UseChinaMirror
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$venvPython = Join-Path $root ".venv\Scripts\python.exe"
$frontendDir = Join-Path $root "frontend"

function Invoke-Step($Name, [scriptblock]$Action) {
    Write-Host ""
    Write-Host "==> $Name"
    & $Action
}

function Get-PythonCommand {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return $python.Source
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return $py.Source
    }

    throw "Python 3.10+ was not found. Install Python first, then rerun setup.bat."
}

function Assert-PythonVersion($PythonCommand) {
    $versionOk = & $PythonCommand -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)"
    if ($LASTEXITCODE -ne 0) {
        throw "Python 3.10+ is required."
    }
}

function Enable-ChinaMirrors {
    $env:NPM_CONFIG_REGISTRY = "https://registry.npmmirror.com"
    $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
    $env:ELECTRON_CUSTOM_DIR = "v{{ version }}"

    $packageLock = Join-Path $frontendDir "package-lock.json"
    if (Test-Path $packageLock) {
        $lock = Get-Content $packageLock -Raw | ConvertFrom-Json
        $electronVersion = $lock.packages."node_modules/electron".version
        if ($electronVersion) {
            $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "ia32" }
            $env:ELECTRON_CUSTOM_FILENAME = "electron-v$electronVersion-win32-$arch.zip"
        }
    }
}

Set-Location $root

Invoke-Step "Checking Python" {
    $python = Get-PythonCommand
    Assert-PythonVersion $python
    & $python --version
}

Invoke-Step "Creating Python virtual environment" {
    if (-not (Test-Path $venvPython)) {
        & (Get-PythonCommand) -m venv (Join-Path $root ".venv")
    }
    & $venvPython --version
}

Invoke-Step "Installing Python dependencies" {
    & $venvPython -m pip install --upgrade pip setuptools wheel
    & $venvPython -m pip install -e ".[dev]"
}

Invoke-Step "Checking Node.js and npm" {
    $node = Get-Command node -ErrorAction SilentlyContinue
    $npm = Get-Command npm -ErrorAction SilentlyContinue
    if (-not $node -or -not $npm) {
        throw "Node.js/npm was not found. Install Node.js 18+ first, then rerun setup.bat."
    }
    node --version
    npm --version
}

Invoke-Step "Installing frontend dependencies" {
    if ($UseChinaMirror) {
        Enable-ChinaMirrors
    }

    if (Test-Path (Join-Path $frontendDir "package-lock.json")) {
        npm ci --prefix frontend
    } else {
        npm install --prefix frontend
    }
}

Write-Host ""
Write-Host "Setup complete."
Write-Host "Run backend: npm run backend:dev"
Write-Host "Run frontend: npm run frontend:dev"
