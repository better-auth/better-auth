# Endpoint To Documentation

This script allows you to copy the code of what you would normally pass into `createAuthEndpoint`, and it will automatically convert it into a `APIMethod` component which you can use in the Better-Auth documentation 
to easily document the details of a given endpoint.

This script will also generate JSDoc which you can then place above each endpoint code.

## Requirements

This does however require Bun since we're running typescript code without transpiling to JS before executing.

## How to run

Head into the `docs/scripts/endpoint-to-doc/input.ts` file,
and copy over the desired `createAuthEndpoint` properties.

Note: The file has `//@ts-nocheck` at the start of the file, so that we can ignore type errors that may be within the handler param.
Since we don't run the handler, we can safely ignore those types.
However, it's possible that the options param may be using a middleware indicated by the `use` prop, and likely using a variable undefined in this context. So remember to remove any `use` props in the options.

Then, make sure you're in the `docs` directory within your terminal.

and run:

```bash
bun scripts:endpoint-to-doc
```

This will read and execute that `input.ts` file which you have recently edited. It may prompt you to answer a few questions, and after it will output a `output.mdx` file which you can then copy it's contents to the Better-Auth docs.