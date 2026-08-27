import type * as BotIdServer from "botid/server";
import { middlewareResponse } from "../../../utils/middleware-response";
import { CAPTCHA_VERIFY_TIMEOUT_MS } from "../constants";
import { EXTERNAL_ERROR_CODES, INTERNAL_ERROR_CODES } from "../error-codes";
import { requestToIncomingHeaders, withTimeout } from "../utils";

export type BotIdVerification = Awaited<
	ReturnType<typeof BotIdServer.checkBotId>
>;
export type CheckBotIdOptions = Parameters<typeof BotIdServer.checkBotId>[0];

export type ValidateRequestContext = {
	request: Request;
	verification: BotIdVerification;
};

type Params = {
	request: Request;
	/**
	 * If you want custom logic to validate the request, you can use this function.
	 * Return `false` to invalidate the request, and `true` to allow the request to proceed.
	 *
	 * Note: Any requests which are invalidated by the `endpoints` will not be checked by this function.
	 *
	 * @example
	 * ```ts
	 * ({ request, verification }) => {
	 * 	return verification.isBot === false;
	 * }
	 */
	validateRequest?: (ctx: ValidateRequestContext) => boolean | Promise<boolean>;
	checkBotIdOptions?: CheckBotIdOptions;
};

function defaultValidateRequest({ verification }: ValidateRequestContext) {
	return !verification.isBot;
}

export const vercelBotId = async ({
	request,
	checkBotIdOptions,
	validateRequest = defaultValidateRequest,
}: Params) => {
	let verification: BotIdVerification;
	try {
		const { checkBotId } = await import("botid/server"); // botid is an optional dependency
		verification = await withTimeout(
			checkBotId({
				...checkBotIdOptions,
				advancedOptions: {
					...checkBotIdOptions?.advancedOptions,
					// Forward the current request's headers so BotID can classify it
					// in runtimes where it can't recover ambient request context on its own.
					// Explicit overrides in checkBotIdOptions still win per header name.
					headers: requestToIncomingHeaders(
						request,
						checkBotIdOptions?.advancedOptions?.headers,
					),
				},
			}),
			CAPTCHA_VERIFY_TIMEOUT_MS,
		);
	} catch (error) {
		throw new Error(INTERNAL_ERROR_CODES.SERVICE_UNAVAILABLE.message, {
			cause: error,
		});
	}
	const isValid = await validateRequest({ request, verification });

	if (isValid) return undefined;

	return middlewareResponse({
		message: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.message,
		code: EXTERNAL_ERROR_CODES.VERIFICATION_FAILED.code,
		status: 403,
	});
};
