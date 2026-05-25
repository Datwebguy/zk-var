param(
  [string]$Sp1ContractsDir = "$env:TEMP\sp1-contracts\contracts",
  [string]$RpcUrl = "https://testrpc.xlayer.tech/terigon",
  [string]$ChainName = "XLAYER_TESTNET",
  [string]$Create2Salt = "0x0000000000000000000000000000000000000000000000000000000000000009"
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  if (!(Test-Path $Path)) {
    throw "Missing .env file at $Path"
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) {
      return
    }

    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $values[$parts[0].Trim()] = $parts[1].Trim()
    }
  }

  return $values
}

function Set-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Value
  )

  $line = "$Key=$Value"
  $content = @()
  if (Test-Path $Path) {
    $content = Get-Content $Path
  }

  $updated = $false
  $content = $content | ForEach-Object {
    if ($_ -match "^\s*$([regex]::Escape($Key))=") {
      $updated = $true
      $line
    } else {
      $_
    }
  }

  if (!$updated) {
    $content += $line
  }

  Set-Content -Path $Path -Value $content
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $repoRoot ".env"
$envValues = Read-EnvFile $envPath

$privateKey = $envValues["PRIVATE_KEY"]
if ([string]::IsNullOrWhiteSpace($privateKey) -or $privateKey -match "^0x0{64}$") {
  throw "PRIVATE_KEY is missing or still the zero placeholder in .env. Add a funded X Layer testnet deployer key locally, then rerun."
}

if (!(Test-Path $Sp1ContractsDir)) {
  throw "SP1 contracts folder not found at $Sp1ContractsDir. Clone succinctlabs/sp1-contracts first."
}

$forge = "forge"
$cast = "cast"
if (Test-Path "$env:USERPROFILE\.foundry\bin\forge.exe") {
  $forge = "$env:USERPROFILE\.foundry\bin\forge.exe"
}
if (Test-Path "$env:USERPROFILE\.foundry\bin\cast.exe") {
  $cast = "$env:USERPROFILE\.foundry\bin\cast.exe"
}

$owner = (& $cast wallet address --private-key $privateKey).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($owner)) {
  throw "Could not derive deployer address from PRIVATE_KEY."
}

Write-Host "Deploying SP1 Groth16 verifier gateway to X Layer testnet..."
Write-Host "Owner/deployer: $owner"

$previousLocation = Get-Location
try {
  Set-Location $Sp1ContractsDir

  $env:CREATE2_SALT = $Create2Salt
  $env:OWNER = $owner
  $env:CHAINS = $ChainName
  Set-Item -Path "env:RPC_$ChainName" -Value $RpcUrl
  $env:PRIVATE_KEY = $privateKey

  & $forge script script/deploy/SP1VerifierGatewayGroth16.s.sol --broadcast --private-key $privateKey
  if ($LASTEXITCODE -ne 0) {
    throw "Gateway deployment failed."
  }

  $env:REGISTER_ROUTE = "true"
  & $forge script script/deploy/v6.1.0/SP1VerifierGroth16.s.sol --broadcast --private-key $privateKey
  if ($LASTEXITCODE -ne 0) {
    throw "Groth16 verifier route deployment failed."
  }

  $deploymentPath = Join-Path $Sp1ContractsDir "deployments\1952.json"
  if (!(Test-Path $deploymentPath)) {
    throw "Expected deployment file was not created: $deploymentPath"
  }

  $deployment = Get-Content $deploymentPath -Raw | ConvertFrom-Json
  $gateway = $deployment.SP1_VERIFIER_GATEWAY_GROTH16
  $route = $deployment.V6_1_0_SP1_VERIFIER_GROTH16

  if ([string]::IsNullOrWhiteSpace($gateway) -or [string]::IsNullOrWhiteSpace($route)) {
    throw "Deployment file did not contain both gateway and verifier route addresses."
  }

  Set-EnvValue -Path $envPath -Key "SP1_VERIFIER" -Value $gateway

  Write-Host "SP1 verifier gateway: $gateway"
  Write-Host "SP1 Groth16 route:     $route"
  Write-Host "Updated .env SP1_VERIFIER with the gateway address."
} finally {
  Set-Location $previousLocation
  Remove-Item Env:\PRIVATE_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:\REGISTER_ROUTE -ErrorAction SilentlyContinue
}
