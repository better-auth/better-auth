import * as z from "zod";
import { RESERVED_AUTHORIZATION_PARAMS } from "./create-authorization-url";

/**
 * Zod schema for the `additionalParams` field on social sign-in and
 * account-linking request bodies. Rejects any key reserved by the
 * authorization-URL builder (see `RESERVED_AUTHORIZATION_PARAMS`), so
 * a caller cannot overwrite `state`, PKCE, `redirect_uri`, etc.
 */
export const additionalAuthorizationParamsSchema = z
	.record(z.string(), z.string())
	.refine(
		(value) =>
			!Object.keys(value).some((key) =>
				(RESERVED_AUTHORIZATION_PARAMS as readonly string[]).includes(key),
			),
		{
			message: `additionalParams cannot include reserved OAuth parameters: ${RESERVED_AUTHORIZATION_PARAMS.join(", ")}`,
		},
	)
	.meta({
		description:
			"Extra query parameters to append to the provider authorization URL (e.g. Cognito identity_provider, Google hd).",
	})
	.optional();
