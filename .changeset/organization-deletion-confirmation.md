---
"better-auth": minor
---

Add optional email confirmation before an organization is deleted. Configure `organizationDeletion.sendDeleteOrganizationVerification` and `organization.delete` emails the requesting member a confirmation link instead of deleting right away; set `organizationDeletion.confirmationMode: "explicit"` so the link only previews the deletion and the app applies it with `POST /organization/delete/confirm`, which keeps mail clients and link scanners from deleting an organization by opening the email. Without it configured, deletion behaves exactly as before.

**Breaking change (types only):** `organization.delete` now returns `Organization | { success: true; message: string }`, to cover the pending-verification response, even for callers who never configure `organizationDeletion`. Code that reads the result without narrowing it (for example `.slug`) needs a type guard.
