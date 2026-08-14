---
"better-auth": patch
---

Add Solid 2 support to the Solid client by replacing `solid-js/store` APIs with APIs shared by Solid 1 and Solid 2. Because the two versions expose their store APIs from incompatible module paths, Solid accessors now invalidate on each Nanostore update instead of reconciling individual nested properties.
