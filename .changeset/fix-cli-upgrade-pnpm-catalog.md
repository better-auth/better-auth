---
"auth": patch
---

`auth upgrade` no longer crashes on pnpm `catalog:` dependency specs. The command resolves catalog versions from `pnpm-workspace.yaml`, compares them to the running CLI version, updates catalog entries while preserving range prefixes, and runs `pnpm install` at the workspace root.
