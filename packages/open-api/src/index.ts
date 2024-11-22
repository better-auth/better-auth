import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/plugins";
import { getEndpoints } from "better-auth/api";
import { generator } from "./generator";

const getHTML = (apiReference: Record<string, any>) => `<!doctype html>
<html>
  <head>
    <title>Scalar API Reference</title>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      type="application/json">
    ${JSON.stringify(apiReference)}
    </script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export const openAPI = () => {
	return {
		id: "open-api",
		endpoints: {
			openAPI: createAuthEndpoint(
				"/api-reference",
				{
					method: "GET",
				},
				async (ctx) => {
					const schema = await generator(ctx.context, ctx.context.options);
					return new Response(getHTML(schema), {
						headers: {
							"Content-Type": "text/html",
						},
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
