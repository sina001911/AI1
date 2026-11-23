# MCP Trust Model

> **Status:** Draft  
> **Version:** 1.0.0  
> **Date:** 2026-11-24  
> **Scope:** Design document describing the trust boundaries, authentication, authorization, and security model for the Model Context Protocol (MCP) integration in AI1.

---

## 1. Overview

AI1 integrates with the Model Context Protocol (MCP) to allow AI assistants to interact with external tools, data sources, and services. MCP introduces a client-server architecture where the AI1 application acts as the **MCP client host** and external MCP servers provide **tools**, **resources**, and **prompts**.

This document describes the trust model governing these interactions — what is trusted, what is not, and where security boundaries are enforced.

## 2. Trust Boundaries

### 2.1 Trust Zones

| Zone | Description | Trust Level |
|------|-------------|-------------|
| **AI1 Core** | Main application process, Electron renderer, DataApi | **Fully Trusted** |
| **MCP Client (IpcApi)** | IPC channel routing MCP requests to servers | **Trusted** |
| **MCP Server (External)** | External stdio/HTTP/SSE process providing tools/resources | **Untrusted** |
| **MCP Server (In-Process)** | Built-in servers running inside AI1 process | **Trusted** |
| **MCP User** | End user configuring and authorizing servers | **Partially Trusted** |

### 2.2 Boundary Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    AI1 Core (Trusted)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │   DataApi    │  │   IpcApi     │  │   MCP Client   │   │
│  └──────────────┘  └──────────────┘  └────────────────┘   │
│                           ↓ IPC / stdio / HTTP             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │   In-Process │  │  External    │  │   OAuth        │   │
│  │   MCP Server │  │  MCP Server  │  │   (OAuth 2.0)  │   │
│  │   (Trusted)  │  │   (Untrusted)│  │   (External)   │   │
│  └──────────────┘  └──────────────┘  └────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 3. Authentication Model

### 3.1 OAuth 2.0 Authorization Code Flow

External MCP servers that require authentication use OAuth 2.0 with PKCE. The flow is:

1. **Authorization Request** — AI1 redirects the user to the MCP server's OAuth authorization endpoint with `client_id`, `redirect_uri`, `scope`, `code_challenge`, and `state`.
2. **User Consent** — The user authenticates with the MCP server and grants/denies access.
3. **Authorization Code** — The MCP server redirects back to AI1's local redirect endpoint with an authorization `code`.
4. **Token Exchange** — AI1 exchanges the `code` for an access token (and optional refresh token) at the MCP server's token endpoint.
5. **Token Storage** — Tokens are stored encrypted at rest (see Section 6).

### 3.2 Token Storage

OAuth tokens are stored per-server in the MCP OAuth storage layer (`src/main/ai/mcp/oauth/storage.ts`):

- **Encryption:** `electron.safeStorage.encryptString()` when available (OS keychain: Windows DPAPI, macOS Keychain, Linux Secret Service).
- **Fallback:** When `safeStorage.isEncryptionAvailable()` returns `false`, credentials are stored in memory only (volatile) and a warning is logged.
- **Schema:** `OAuthStorageData` with `clientInfoByIssuer` and `tokensByIssuer` maps, keyed by issuer URL.
- **Migration:** Legacy plaintext storage is migrated to encrypted on first read.

### 3.3 Token Lifecycle

| Event | Action |
|-------|--------|
| Authorization | Access token + optional refresh token obtained |
| Token Use | Access token sent in `Authorization: Bearer` header to MCP server |
| Token Expiry | Refresh token used to obtain new access token |
| Revocation | Token deleted from storage; server notified if revocation endpoint exists |
| Logout | All tokens deleted from storage |

## 4. Authorization Model

### 4.1 MCP Capabilities

MCP servers declare capabilities during initialization:

| Capability | Description | Trust Implication |
|------------|-------------|-------------------|
| `tools` | Executable functions | **High** — executes arbitrary code on server side |
| `resources` | Read-only data access | **Medium** — can expose sensitive data |
| `prompts` | Templated prompt fragments | **Low** — influences assistant behavior |
| `sampling` | LLM sampling requests | **Medium** — can trigger model inference |
| `elicitation` | User interaction requests | **Medium** — can prompt user for input |
| `roots` | File system roots | **High** — can access local files |

### 4.2 Tool Authorization

Tools are executed within the context of a user conversation. The AI1 host:

1. **Validates** the tool name against the server's declared capabilities.
2. **Validates** input arguments against the tool's input schema.
3. **Executes** the tool via the MCP connection (stdio or HTTP).
4. **Returns** the result to the assistant.

No additional authorization check is performed per-tool-call beyond the initial OAuth grant. Users should only connect to MCP servers they trust.

## 5. Data Flow and Isolation

### 5.1 Request Flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Assistant  │────▶│   MCP Client     │────▶│  MCP Server     │
│  (AI1)      │     │   (IpcApi)       │     │   (External)    │
└─────────────┘     └──────────────────┘     └─────────────────┘
                                                │
                                                ▼
                                        ┌─────────────────┐
                                        │  External       │
                                        │  Service/API    │
                                        └─────────────────┘
```

### 5.2 Data Isolation

- **Per-Server Isolation:** Each MCP server runs in its own process (stdio) or HTTP session. Servers cannot access each other's state.
- **Per-User Isolation:** OAuth tokens are stored per-user (per AI1 installation). Different users on the same machine have separate token stores.
- **Per-Session Isolation:** Tool calls are scoped to a specific conversation/session. Tool results are not automatically shared across sessions unless explicitly passed via shared context.

### 5.3 Sandboxing

| Aspect | Implementation |
|--------|---------------|
| Process | External MCP servers run as separate OS processes |
| Network | Outbound network access depends on the server's own configuration; AI1 does not proxy or restrict |
| File System | Servers access the file system directly; no AI1-enforced sandbox |
| Memory | In-process servers share the AI1 process memory space |

## 6. Credential Storage

### 6.1 Storage Locations

| Credential Type | Storage Location | Encryption |
|-----------------|------------------|------------|
| Provider API Keys | SQLite (`user_provider.apiKeys`) | AES-256 via `SecureCredentialStore` |
| OAuth Access Tokens | JSON file (`{userData}/credentials/*.oauth.json`) | `safeStorage` or AES-256-GCM |
| OAuth Refresh Tokens | JSON file (`{userData}/credentials/*.oauth.json`) | `safeStorage` or AES-256-GCM |
| MCP Server Configs | SQLite (`mcp_servers` table) | Plaintext (server URLs, not secrets) |

### 6.2 SecureCredentialStore

`src/main/data/services/SecureCredentialStore.ts` provides:

- **`encrypt(value)`** — Encrypts using `safeStorage.encryptString()` when available, otherwise AES-256-GCM via `node:crypto`.
- **`decrypt(value)`** — Decrypts using `safeStorage.decryptString()` when available, otherwise AES-256-GCM.
- **`get/set/delete/has/getAll`** — Standard key-value operations.
- **Persistence:** Encrypted JSON file at `{userData}/credentials/credentials.json`.
- **Key Derivation:** scrypt with machine ID-derived salt.

## 7. Security Boundaries

### 7.1 What AI1 Trusts

- **MCP Server Code:** AI1 does not audit, sandbox, or restrict external MCP server code. Users should only connect to trusted servers.
- **Tool Output:** Tool results are returned to the assistant as-is. AI1 does not sanitize or validate tool output content beyond schema validation.
- **OAuth Tokens:** Tokens are treated as sensitive and encrypted at rest.

### 7.2 What AI1 Does NOT Trust

- **External MCP Servers:** Can execute arbitrary code, access local files, make network requests, and exfiltrate data.
- **Tool Output:** May contain malicious content, injected prompts, or sensitive data.
- **User Input:** User-provided server URLs and credentials are treated as untrusted input.

### 7.3 Known Limitations

| Limitation | Description | Mitigation |
|------------|-------------|------------|
| No server sandboxing | External MCP servers run with full user privileges | User must vet servers before connecting |
| No tool output sanitization | Tool results may contain malicious content | User reviews assistant output |
| No per-tool permissions | All tools from a connected server are available | Connect only to trusted servers |
| No network sandboxing | Servers can make arbitrary outbound network requests | User must trust server's network behavior |
| No replay protection | Replayed tool calls may have side effects | Users should be aware of idempotency |

## 8. User Controls

### 8.1 Server Management

Users can:

- **Add** MCP servers via the AI1 settings UI
- **Remove** MCP servers at any time (tokens are deleted)
- **Configure** server-specific settings (URL, headers, etc.)
- **Enable/disable** servers individually

### 8.2 OAuth Consent

When connecting to an OAuth-protected MCP server:

1. User is redirected to the server's OAuth authorization page
2. User reviews requested scopes
3. User approves or denies access
4. AI1 stores the resulting tokens encrypted

### 8.3 Revocation

Users can revoke access by:

- Removing the MCP server from AI1 settings (deletes stored tokens)
- Revoking access on the OAuth provider's account page
- Rotating credentials on the OAuth provider

## 9. Recommendations for Users

### 9.1 Connecting to MCP Servers

- **Only connect to servers you trust** — they run with your user privileges
- **Review OAuth scopes** before approving — only grant necessary permissions
- **Regularly review** connected servers and remove unused ones
- **Use separate accounts** for MCP integration when possible

### 9.2 Tool Usage

- **Review tool outputs** before acting on them
- **Be cautious with destructive tools** (file deletion, data modification)
- **Monitor network activity** if connecting to unknown servers

## 10. Future Considerations

| Item | Description | Priority |
|------|-------------|----------|
| Server sandboxing | Run external MCP servers in restricted containers | High |
| Per-tool permissions | Allow users to enable/disable individual tools | Medium |
| Tool output sanitization | Sanitize/tool output before assistant consumption | Medium |
| Replay protection | Detect and reject replayed tool calls | Low |
| Server reputation | Community ratings/trust scores for public servers | Low |

---

## Appendix A: Threat Model

| Threat | Asset | Impact | Likelihood | Mitigation |
|--------|-------|--------|------------|------------|
| Malicious MCP server exfiltrates data | User data, credentials | High | Medium | User vetting, OAuth scopes |
| Compromised OAuth token | Connected services | High | Low | Encrypted storage, short-lived tokens |
| Malicious tool output injection | Assistant behavior | Medium | Medium | User review of output |
| Replayed tool call | Data integrity | Low | Low | User awareness |

## Appendix B: Related Documents

- [Project Audit](../project-audit.md) — Security audit findings (Section 2.11)
- [UI/UX Design Proposal](../ai1-ui-ux-design-proposal.md) — UI security considerations
- [Knowledge RAG ANN Spec](../knowledge-rag-ann-spec.md) — Vector search security considerations
