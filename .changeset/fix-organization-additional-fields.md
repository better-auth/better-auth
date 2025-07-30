---
"better-auth": patch
---

Fix organization additional fields not being returned in API responses

- Enhanced transformOutput function to properly handle field filtering with returned attribute
- Fixed organization adapter to preserve all transformed fields
- Added comprehensive test cases for additional fields functionality
- Identified schema generation issue that prevents complete resolution

This addresses issue #3686 where organization additional fields configured with returned: true were not being included in API responses from listOrganizations() and getFullOrganization().
