---
"better-auth": patch
---

Allows explicit optional "slug" parameter for creation via `additionalFieldsSchema` marking `slug` as optional.

```ts
plugins: [
  organization({
    schema: {
      organization: {
        additionalFields: {
          slug: {
            type: 'string',
            // Required - allows optional
            required: false,
            // optional - allows setting to null is future updates
            nullable: true,
            // optional - prevents slug from return on existing records
            transform: {
              output: (value) => (value = null),
            },
          },
        }
      }
    },
  })
]
```
