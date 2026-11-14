---
"@better-auth/oauth-provider": minor
---

When two OAuth provider extensions advertise the same list in discovery, such as `authorization_details_types_supported`, discovery now publishes both lists combined, in registration order and without duplicates. Previously only the first-registered extension's list appeared, so clients could not discover the values the other extension supports.

This changes the documented rule that a metadata key two extensions contribute resolves to the first one registered. That rule now applies only when the values are not both lists, and those collisions still log a warning. Keys the provider owns are still never changed by extensions.
