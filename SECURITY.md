# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Use GitHub's private vulnerability reporting:
**[Report a vulnerability](https://github.com/NolanLT/local-browser-mcp/security/advisories/new)**
(Security tab → Report a vulnerability). You'll get a response as soon as possible.

## Threat model

This tool gives an AI agent a real, scriptable browser. Understand the boundaries:

- **`browser_eval` runs arbitrary JavaScript** in the page with the page's full privileges
  (DOM, storage, in-page tokens, authenticated `fetch`). It's harmless on your own dev site and
  powerful on a real one.
- **The allowlist is the primary boundary.** Navigation is rejected unless the host is in
  `LOCAL_BROWSER_ALLOWED_HOSTS` (default `localhost,127.0.0.1`) and the protocol is http/https.
- **`LOCAL_BROWSER_ALLOW_ALL=true` removes that boundary.** Every visited page then becomes
  untrusted input (a prompt-injection surface) that the agent can read and script. Leave it off
  unless you specifically want an agent-driven online browser.
- **Ephemeral profile.** The browser uses a fresh context with no saved cookies, logins, or
  passwords, so nothing you're signed into elsewhere is exposed.
- **No built-in approval dialog.** The server is headless. When run under a client like Claude
  Code, host additions and eval calls are gated by that client's own per-tool permission prompts.

## Supported versions

The latest released version receives fixes. Pin a version/commit if you need stability.
