---
"@better-auth/sso": patch
---

### Security: upgrade samlify to 2.12.0

Upgrades the SAML XML processing library from 2.10.2 to 2.12.0:

- **XPath injection protection**: all XPath expressions now use value escaping instead of string interpolation
- **XXE prevention**: the XML parser defaults to strict mode that rejects entity references
- **Dependency reduction**: removes `node-forge`, `pako`, `uuid`, and `camelcase` in favor of Node built-ins

PEM keys and certificates with leading whitespace are now normalized automatically before being passed to samlify. This prevents `DECODER routines::unsupported` errors when keys are copied from indented config files or environment variables.

Requires Node 20+.
