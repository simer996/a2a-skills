<#
.SYNOPSIS
  Registers a third-party / Copilot Studio A2A agent card in a Microsoft 365 tenant so it appears in
  Microsoft 365 admin center > Agents > All agents. Assign users/groups from the admin center UI afterwards.
  Requires PowerShell 7+ (pwsh).

.DESCRIPTION
  Graph: POST https://graph.microsoft.com/beta/copilot/agentRegistrations  (AgentRegistration.ReadWrite.All)

  Sign-in uses the OAuth device-code flow. The sign-in prints one line starting with "DEVICECODE>>".
  The admin opens https://login.microsoft.com/device and enters the code. No passwords pass through this script.

  Idempotent: when the registration already exists (GET by sourceAgentId returns 200), it is reused rather than duplicated.
  Results are written to <OutDir>\result.json.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$AgentCardPath,
  [Parameter(Mandatory)][string]$TenantId,
  [string]$DisplayName,
  [string]$Description,
  [string]$SourceAgentId,
  [string]$OriginatingStore = 'CopilotStudio',
  [switch]$ReplaceExisting,
  [switch]$DryRun,
  [string]$OutDir = (Join-Path (Get-Location) 'a2a-provision-out')
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutDir | Out-Null

$GraphClientId = '14d82eec-204b-4c2f-b7e8-296a70dab67e'   # Microsoft Graph Command Line Tools (public client)
$RegUri        = 'https://graph.microsoft.com/beta/copilot/agentRegistrations'

$result = [ordered]@{ tenantId = $TenantId; registrationId = $null; registrationStatus = $null
  adminCenterVisible = $null; warnings = @(); error = $null }
function Save-Result { $result | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $OutDir 'result.json') -Encoding utf8 }
function Warn($m) { Write-Host "WARN>> $m" -ForegroundColor Yellow; $result.warnings += $m }

function Get-DCToken([string]$ClientId, [string]$Scope) {
  $d = Invoke-RestMethod -Method POST -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode" `
        -Body @{ client_id = $ClientId; scope = "$Scope openid profile" }
  Write-Host "DEVICECODE>> $($d.message)" -ForegroundColor Cyan
  $end = (Get-Date).AddSeconds($d.expires_in)
  while ((Get-Date) -lt $end) {
    Start-Sleep -Seconds $d.interval
    try {
      return Invoke-RestMethod -Method POST -Uri "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token" `
        -Body @{ grant_type = 'urn:ietf:params:oauth:grant-type:device_code'; client_id = $ClientId; device_code = $d.device_code }
    } catch {
      $e = try { ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { $null }
      if ($e -eq 'authorization_pending') { continue }
      if ($e -eq 'slow_down') { Start-Sleep 5; continue }
      throw
    }
  }
  throw 'Device code expired before sign-in completed.'
}

try {
  # ---------- 1. Validate the agent card (it is registered verbatim, never modified) ----------
  $cardRaw = (Get-Content -LiteralPath $AgentCardPath -Raw).Trim()
  $card = $cardRaw | ConvertFrom-Json
  $ifaces = @($card.supportedInterfaces | Where-Object { $_ })
  if ($ifaces.Count -eq 0 -and $card.url) { $ifaces = @([pscustomobject]@{ url = $card.url }) }
  if ($ifaces.Count -eq 0) { throw 'Agent card has no endpoint: needs supportedInterfaces[].url or a top-level url.' }
  foreach ($i in $ifaces) { if (([uri]$i.url).Scheme -ne 'https') { throw "Interface URL must be HTTPS: $($i.url)" } }
  if (-not $SourceAgentId) { $SourceAgentId = $card.name }
  if (-not $DisplayName)   { $DisplayName = $card.displayName ?? $card.name }
  if (-not $Description)   { $Description = $card.description }
  if ($card.provider -is [string]) { Warn 'provider is a string; the internal guide reports Graph may return 500 unless it is an object {organization,url}. Card is still sent unchanged.' }
  $cardTenant = [regex]::Match($ifaces[0].url, 'tenants/([0-9a-fA-F-]{36})').Groups[1].Value
  if ($cardTenant -and $cardTenant -ne $TenantId) {
    Warn "The agent endpoint is in tenant $cardTenant, not $TenantId. The agent can still be registered and shown in the admin center, but runtime calls will probably fail auth because users from another tenant can't get a token for it."
  }
  Write-Host "Card validated; it will be registered exactly as provided: $AgentCardPath"
  if ($DryRun) { Write-Host 'DRYRUN>> stopping before any tenant change.'; Save-Result; return }

  # ---------- 2. Graph: register ----------
  $g = Get-DCToken $GraphClientId 'https://graph.microsoft.com/AgentRegistration.ReadWrite.All'
  $gh = @{ Authorization = "Bearer $($g.access_token)" }
  $me = Invoke-RestMethod -Headers $gh -Uri 'https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName'
  Write-Host "Signed in as $($me.userPrincipalName)"

  $existing = $null; $replaced = $false
  try { $existing = Invoke-RestMethod -Headers $gh -Uri "$RegUri/$([uri]::EscapeDataString($SourceAgentId))" } catch { }
  if ($existing -and $ReplaceExisting) {
    try { Invoke-RestMethod -Method DELETE -Headers $gh -Uri "$RegUri/$([uri]::EscapeDataString($existing.id))" | Out-Null }
    catch { throw "Unregister failed: $($_.ErrorDetails.Message)" }
    Write-Host "UNREGISTERED>> id=$($existing.id)" -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    $existing = $null; $replaced = $true
  }
  if ($existing) {
    Warn "A registration for $SourceAgentId already exists, so it was reused rather than duplicated. Use -ReplaceExisting to unregister and register again."
    $result.registrationId = $existing.id; $result.registrationStatus = 'existing'
  } else {
    $now = (Get-Date).ToUniversalTime().ToString('o')
    $meta = [ordered]@{ displayName = $DisplayName; description = $Description; ownerIds = @($me.id); sourceAgentId = $SourceAgentId
      originatingStore = $OriginatingStore; createdBy = $me.id; sourceCreatedDateTime = $now; sourceLastModifiedDateTime = $now } | ConvertTo-Json -Depth 5 -Compress
    # Splice the raw card text in so the card is sent exactly as provided.
    $body = $meta.Substring(0, $meta.Length - 1) + ',"agentCard":' + $cardRaw + '}'
    try {
      $reg = Invoke-RestMethod -Method POST -Headers $gh -ContentType 'application/json' -Uri $RegUri -Body ([Text.Encoding]::UTF8.GetBytes($body))
    } catch { throw "Graph registration failed: $($_.ErrorDetails.Message)" }
    $result.registrationId = $reg.id; $result.registrationStatus = if ($replaced) { 'replaced' } else { 'created' }
    $rb = Invoke-RestMethod -Headers $gh -Uri "$RegUri/$([uri]::EscapeDataString($reg.id))"
    $sent = ($cardRaw | ConvertFrom-Json | ConvertTo-Json -Depth 50 -Compress)
    $stored = ($rb.agentCard | ConvertTo-Json -Depth 50 -Compress)
    $result.cardStoredIntact = ($sent -eq $stored)
    if (-not $result.cardStoredIntact) { Warn 'The agent card that Graph stored differs from the card you provided. Compare against readback.json.' }
    $rb | ConvertTo-Json -Depth 50 | Set-Content (Join-Path $OutDir 'readback.json') -Encoding utf8
  }
  Write-Host "REGISTERED>> id=$($result.registrationId)" -ForegroundColor Green
  $result.adminCenterVisible = 'expected - check admin.microsoft.com > Agents > All agents'
} catch {
  $result.error = "$_"; Write-Host "ERROR>> $_" -ForegroundColor Red; Save-Result; exit 1
}
Save-Result
Write-Host "RESULT>> $(Join-Path $OutDir 'result.json')"

