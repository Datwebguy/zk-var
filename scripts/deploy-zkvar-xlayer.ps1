param(
  [string]$RpcUrl = "https://rpc.xlayer.tech",
  [int]$ChainId = 196
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

function Require-EnvValue {
  param(
    [hashtable]$Values,
    [string]$Key
  )

  $value = $Values[$Key]
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Key is missing in .env"
  }

  return $value
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $repoRoot ".env"
$envValues = Read-EnvFile $envPath

$privateKey = Require-EnvValue $envValues "PRIVATE_KEY"
$sp1Verifier = Require-EnvValue $envValues "SP1_VERIFIER"
$programVKey = Require-EnvValue $envValues "SP1_PROGRAM_VKEY"

if ($privateKey -match "^0x0{64}$") {
  throw "PRIVATE_KEY is still the zero placeholder in .env."
}
if ($sp1Verifier -match "^0x0{40}$") {
  throw "SP1_VERIFIER is still the zero placeholder in .env."
}
if ($programVKey -match "^0x0{64}$") {
  throw "SP1_PROGRAM_VKEY is still the zero placeholder in .env."
}

$forge = "forge"
if (Test-Path "$env:USERPROFILE\.foundry\bin\forge.exe") {
  $forge = "$env:USERPROFILE\.foundry\bin\forge.exe"
}

Write-Host "Deploying ZK-VAR contracts to X Layer mainnet..."
& $forge script script/Deploy.s.sol --rpc-url $RpcUrl --broadcast
if ($LASTEXITCODE -ne 0) {
  throw "ZK-VAR deployment failed."
}

$broadcastPath = Join-Path $repoRoot "broadcast\Deploy.s.sol\$ChainId\run-latest.json"
if (!(Test-Path $broadcastPath)) {
  throw "Could not find Foundry broadcast file at $broadcastPath"
}

$broadcast = Get-Content $broadcastPath -Raw | ConvertFrom-Json
$creates = @($broadcast.transactions | Where-Object { $_.transactionType -eq "CREATE" })

if ($creates.Count -lt 3) {
  throw "Expected at least 3 CREATE transactions, found $($creates.Count)."
}

$zkVerifier = $creates[0].contractAddress
$disputeRegistry = $creates[1].contractAddress
$predictionPool = $creates[2].contractAddress

Set-EnvValue -Path $envPath -Key "VITE_ZK_VERIFIER_ADDRESS" -Value $zkVerifier
Set-EnvValue -Path $envPath -Key "VITE_DISPUTE_REGISTRY_ADDRESS" -Value $disputeRegistry
Set-EnvValue -Path $envPath -Key "VITE_PREDICTION_POOL_ADDRESS" -Value $predictionPool

Write-Host "ZKVerifier:       $zkVerifier"
Write-Host "DisputeRegistry:  $disputeRegistry"
Write-Host "PredictionPool:   $predictionPool"
Write-Host "Updated .env frontend contract addresses."

Write-Host "Initializing demo pools and disputes on the new contracts..."
& $forge script script/InitializePools.s.sol --rpc-url $RpcUrl --broadcast
if ($LASTEXITCODE -ne 0) {
  throw "Pool/dispute initialization failed."
}

Write-Host "ZK-VAR deployment and initialization complete."
