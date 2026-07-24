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
            // Optional
            required: false,
            // Optional - forces `slug` to be returned as null in responses
            transform: {
              output: () => null,
            },
          },
        }
      }
    },
  })
]
```
