---
"@better-auth/stripe": patch
"@better-auth/demo-nextjs": patch
---

fix(stripe): tiral subscription should use update flow
This fix addresses the issue related to changing a plan from a trial, which was creating two plans for a customer instead of updating the existing one.
