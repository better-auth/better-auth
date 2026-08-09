---
"@better-auth/core": patch
"better-auth": patch
---

You can now sign in with AgentID, an OpenID Connect provider for AI agents, through `socialProviders.agentid`. The agent completes the sign-in itself by approving the request out of band, so the browser waits on AgentID's page until it does. Information about the human behind the agent is available through the `owner_profile` and `owner_email` scopes, and reaches your user via `mapProfileToUser`.
