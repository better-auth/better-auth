import { createAuthEndpoint } from "@better-auth/core/api";
import { appendQuery, getUIErrorURL } from "../../ui";
import { HIDE_METADATA } from "../../utils/hide-metadata";

function getSafeErrorQuery(url: URL) {
	const unsafeCode = url.searchParams.get("error") || "UNKNOWN";
	const safeCode = /^[\'A-Za-z0-9_-]+$/.test(unsafeCode)
		? unsafeCode
		: "UNKNOWN";
	const queryParams = new URLSearchParams();
	queryParams.set("error", safeCode);
	const description = url.searchParams.get("error_description");
	if (description) {
		queryParams.set("error_description", description);
	}
	return queryParams;
}

export const error = createAuthEndpoint(
	"/error",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			openapi: {
				description: "Redirects to the configured auth error page",
				responses: {
					"302": {
						description: "Redirect",
					},
				},
			},
		},
	},
	async (c) => {
		const url = new URL(c.request?.url || c.context.baseURL);
		const queryParams = getSafeErrorQuery(url);
		return new Response(null, {
			status: 302,
			headers: {
				Location: appendQuery(getUIErrorURL(c.context), queryParams),
			},
		});
	},
);
