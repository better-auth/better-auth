---
"better-auth": major
"@better-auth/core": major
---

Replace the hand-rolled OpenAPI generator with `@asteasolutions/zod-to-openapi`. Adds `response` and `errors` fields on `createAuthEndpoint` options, with the Zod schema you already declare as `body`/`query` becoming the single source of truth for OpenAPI documentation. Default output is OpenAPI 3.1.

The new contract for a route:

```ts
createAuthEndpoint(
  "/sign-up/email",
  {
    method: "POST",
    body: signUpEmailBodySchema,                // validates request, documents requestBody
    response: z.object({ token, user }),        // documents 200 response, runtime-validated in dev (opt-in)
    errors: ["USER_ALREADY_EXISTS", "PASSWORD_TOO_SHORT"],   // documents non-2xx responses
    metadata: { openapi: { description, tags, operationId } },  // prose-only
  },
  async (ctx) => { /* unchanged */ },
);
```

Fixes to the generated spec that fall out of the migration:
- OpenAPI 3.1 `type: [T, "null"]` unions replace the OAS 3.0 `nullable: true` keyword, which is invalid in 3.1. Closes the symptom in #6691.
- `$ref + sibling keys` no longer produced. Closes #8014-class bugs for 3.0 consumers.
- `/sign-in/social` no longer declares `required: ["redirect", "token", "user"]` while the OAuth-redirect branch returns only `{ url, redirect }`.
- `/sign-up/email` now reflects `AdditionalUserFieldsInput` fields accurately via the dynamic `additionalFields` merge (addresses #3263 for the request body).
- Duplicated field descriptions collapse into a single `.meta({ description })` annotation on the Zod schema.

Breaking changes:
- `metadata.openapi.requestBody`, `metadata.openapi.parameters`, and `metadata.openapi.responses` are no longer the recommended surface. A transitional fallback keeps them working for unmigrated plugins in this release (OAS 3.0 `nullable: true` is automatically rewritten to 3.1 unions), but the fallback is slated for removal in the next major.
- `createAuthEndpoint` options type gains `response?: StandardSchemaV1` and `errors?: readonly string[]`. Existing callers compile unchanged because both are optional.
- OpenAPI default version is `3.1.0`. Pass `openAPI({ version: "3.0" })` to keep 3.0 output if you depend on a downstream tool that hasn't adopted 3.1.

Plugin author migration (per route):

```diff
 createAuthEndpoint("/my-route", {
   method: "POST",
   body: z.object({ email: z.email() }),
+  response: z.object({ success: z.boolean() }),
+  errors: ["BAD_REQUEST", "USER_NOT_FOUND"],
   metadata: {
     openapi: {
       description: "Short description",
-      requestBody: { content: { "application/json": { schema: { /* ... */ } } } },
-      responses: { "200": { description: "Success", content: { /* ... */ } } },
     },
   },
 }, handler);
```
