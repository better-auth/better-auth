# Security Policy

## CSRF Protection

Better Auth protects against CSRF by enforcing strict origin checks and setting cookies with the `SameSite` attribute. As a best practice, any GET request should be designed to avoid modifying resources. If a GET request does alter data, such as in an OAuth callback, additional safeguards (e.g., state parameter verification) must be implemented. Any request containing cookies but missing an `Origin` or `Referer` header is rejected. Requests with these headers that don’t match `trustedOrigins` are also discarded.


## Open Redirect Protection

Any endpoint added to a Better Auth instance, whether from a plugin or the core, should only use `callbackURL`, `currentURL`, or `redirectTo` for redirecting users post-action. These values are validated against `trustedOrigins` for security. Additionally, no endpoint handling GET requests should modify resources unless it has its own protection mechanisms in place.

## Reporting a Vulnerability

If you discover a security vulnerability within Better Auth, please send an e-mail to security@better-auth.com.

All reports will be promptly addressed, and you'll be credited accordingly.