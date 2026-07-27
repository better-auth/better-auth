---
"better-auth": patch
---

Export the `MCPOptions` interface from the MCP plugin. It was the only plugin options type left unexported, so any consumer compiling with `declaration: true` that exports a value typed by the auth instance failed with TS4023 ("has or is using name 'MCPOptions' … but cannot be named"). The interface is now exported like its siblings (e.g. `BearerOptions`) and reachable through the `better-auth/plugins` barrel, giving declaration emit a portable path to name it. Type-only change, no runtime impact.
