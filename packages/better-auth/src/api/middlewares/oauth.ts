import {
	defineRequestState,
	getCurrentAuthContext,
} from "@better-auth/core/context";
import { APIError } from "better-call";
import z from "zod";

type OauthState = Record<string, any>;

const {
	get: getOAuthState,
	/**
	 * @internal This is unsafe to be used directly. Use setOauthState instead.
	 */
	set: __internal__setOauthState,
} = defineRequestState<OauthState>(z.record(z.string(), z.any()));

export { getOAuthState };

export async function setOauthState(state: OauthState) {
	const { context } = await getCurrentAuthContext();
	const additionalDataConfig =
		context.options.advanced?.oauthConfig?.additionalData;
	if (additionalDataConfig?.enabled) {
		const schema = additionalDataConfig.schema;
		if (schema) {
			const result = await schema["~standard"].validate(state);
			if (result.issues !== undefined) {
				throw new APIError("BAD_REQUEST", {
					message: `Invalid oauth additional data`,
				});
			}
		}
		await __internal__setOauthState(state);
	}
}
