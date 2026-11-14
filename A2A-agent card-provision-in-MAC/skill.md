---
name: a2a-agent-admin-provision
description: Register an A2A agent card (Copilot Studio A2A channel or third-party A2A endpoint) in a Microsoft 365 tenant so it shows in Microsoft 365 admin center > Agents > All agents. Triggers include "provision this agent card", "register A2A agent in admin center", "make my A2A agent show in M365 admin portal", "agentRegistrations", or any request that pastes an agent-card JSON and asks to publish it to a tenant.
metadata:
  version: "1.0"
compatibility: Windows/macOS with PowerShell 7+ (pwsh). Needs a tenant admin (Global Admin, or AI Administrator / Agent Registry Administrator) to complete device-code sign-ins. Uses preview APIs.
---

# Provision an A2A agent card into the Microsoft 365 admin center

## Inputs to collect (use ask_user; never ask for passwords)
| Input | Required | Notes |
|---|---|---|
| Agent card JSON (pasted or file path) | yes | Registered **exactly as provided**; nothing is added or removed (securitySchemes, securityRequirements, etc. are kept). Must have an HTTPS `supportedInterfaces[].url` or top-level `url`. |
| Target tenant ID (GUID) | yes | The tenant whose admin center should show the agent. |
| Display name, description | no | Registration-level fields (not written into the card). Defaults come from the card. The description drives orchestrator routing, so keep it specific. |
| Replace existing? | no | `-ReplaceExisting` unregisters an existing registration with the same ID and registers again. Without it, an existing registration is reused untouched. |

This skill only registers the agent. To assign it to users or groups, use the admin center UI (Agents > All agents > select agent > Deploy/Assign).

## Run
1. Save the card **verbatim** (do not reformat or edit it) to `<session files>\a2a-reg\agent-card.json`.
2. Validate it without changing anything:
   `pwsh -NoProfile -File "$HOME\.copilot\skills\a2a-agent-admin-provision\scripts\Provision-A2AAgent.ps1" -AgentCardPath <card> -TenantId <tid> -OutDir <dir> -DryRun`
   Show the user any `WARN>>` lines.
3. Run the same command without `-DryRun`. Use **powershell mode=async**, and give the script file path only after it has been written (writing the file and running it in parallel breaks).
4. Poll with read_powershell. The `DEVICECODE>>` line gives a code. Relay it with ask_user: "open https://login.microsoft.com/device, enter CODE, and sign in with the tenant admin; tick *Consent on behalf of your organization* if shown". Expect 1 sign-in. If the token wait continues after the user says they're done, keep polling for about 90 seconds before you assume the sign-in failed.
5. Read `<OutDir>\result.json` and report the outcome. Ask the user to confirm the agent appears in admin.microsoft.com > Agents > All agents (search by display name).

## Output (result.json)
`registrationId`, `registrationStatus` (created/replaced/existing), `cardStoredIntact` (true when the card Graph stored matches the input), `adminCenterVisible`, `warnings[]`, `error`. Also `readback.json`, which is the full registration as stored by Graph.

## What the script does
1. Validates the card without modifying it. It must parse as JSON and have an HTTPS endpoint. The script warns about cross-tenant endpoints and a string `provider`. **It never edits the card.** The raw card text is spliced into the request body so Graph receives it byte-for-byte.
2. Graph device-code sign-in, using the Graph CLI public client `14d82eec-…` and the scope `AgentRegistration.ReadWrite.All`.
   - Calls `GET /beta/copilot/agentRegistrations/{sourceAgentId}`. If the registration exists, it is reused, or with `-ReplaceExisting` it is `DELETE`d first. Then it calls `POST /beta/copilot/agentRegistrations` with `displayName, description, ownerIds=[me], sourceAgentId, originatingStore, createdBy=me, source*DateTime, agentCard`, reads the registration back, and compares the stored card to the input.

## Gotchas (verified in a real run)
1. **The registration ID equals `sourceAgentId`, not `T_…`**, when you supply `sourceAgentId`. For example, it returned `cr3ad_…`. The internal guide promises a `T_` ID, but that did not happen.
2. **The agent DOES appear in the admin center under Agents > All agents** right after the Graph POST (HTTP 201). Registration alone meets the "visible in admin portal" goal.
3. **Never POST the registration twice.** Each POST creates a duplicate. The script checks by `sourceAgentId` first.
4. `GET /beta/copilot/agentRegistrations` (list, `$top`, `$filter`) returns **404 UnknownError**. Only GET by ID works.
5. `originatingStore` values the service doesn't recognize (for example `CopilotStudio`) are stored as `Unknown`. This is harmless.
6. **Never strip or rewrite the card.** Graph accepts the Copilot Studio card as is, including `securitySchemes`/`securityRequirements`, and stores it unchanged (verified). Removing those fields leaves the registration without any auth information. The internal guide reports that a string `provider` causes a Graph 500. If that happens, ask the user to fix their card rather than changing it silently.
7. **Cross-tenant caveat.** Copilot Studio A2A endpoints embed `tenants/<agent-tenant>` and require Entra tokens for the scope `https://api.powerplatform.com/copilotstudio-a2a/MCS.InvokeAsA2A` from that tenant. When the agent tenant isn't the target tenant, registration and visibility still work. Runtime invocation will probably fail auth, but you can still see whether the orchestrator routes to the agent.
8. Device-code sign-in: the user should use the tenant admin account, ideally in an InPrivate window. Tokens stay only in the script's memory, and credentials are never handled by the agent.
9. Write the script and any helper files **before** starting the async run. Firing both in parallel gave a "not recognized as a script file" error.

## Prerequisite (Copilot Studio agents only)
Publish the agent, then open Channels > A2A client to provision the channel and copy the endpoint card. The `MCS.InvokeAsA2A` app registration from the Learn doc (publication-channels-mcp-agent-to-agent) is only needed for custom clients that call the endpoint directly.
