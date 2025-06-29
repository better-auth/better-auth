import type { BetterAuthPlugin } from "better-auth/types";
import { APIError } from "better-auth/api";
import { checkBotId } from "botid/server";
import { wildcardMatch } from "./utils";

const ERROR_CODES = {
	BOT_DETECTED: "Bot detected",
};

export type BotIdVerification = Awaited<ReturnType<typeof checkBotId>>;

export type BotIdOptions = {
	/**
	 * Whether to disable Vercel BotID.
	 *
	 * @default false
	 */
	disable?: boolean;
	/**
	 * The endpoints which will be checked for bots.
	 * This can be a list of endpoints or "all" to check all endpoints. Supports wildcards.
	 *
	 * @example
	 * ```ts
	 * ["/sign-up/*", "/sign-in/*"]
	 * ```
	 *
	 * @default "all"
	 */
	endpoints?: string[] | "all";
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
	validateRequest?: ({
		request,
		verification,
	}: { request: Request; verification: BotIdVerification }) => Promise<boolean>;
	checkBotIdOptions?: Parameters<typeof checkBotId>[0];
};

export const botId = (options: BotIdOptions) => {
	/**
	 * Check if the path is valid for bot detection
	 */
	const isValidPath = (path: string) => {
		if (
			options.endpoints === "all" ||
			!options.endpoints?.length ||
			options.disable === true
		)
			return true;

		const isMatch = wildcardMatch(options.endpoints);
		return isMatch(path);
	};

	return {
		id: "botid",
		hooks: {
			before: [
				{
					matcher(context) {
						return isValidPath(context.path);
					},
					async handler(ctx) {
						// If no request, it means the endpoint was called directly from auth.api
						if (!ctx.request) return;

						// Check if the request is a bot
						const verification = await checkBotId(options.checkBotIdOptions);
						const customValidation = await options.validateRequest?.({
							request: ctx.request,
							verification,
						});
						if (
							customValidation === undefined
								? verification.isBot
								: !customValidation
						) {
							throw new APIError("FORBIDDEN", {
								message: ERROR_CODES.BOT_DETECTED,
								code: "BOT_DETECTED" as const,
							});
						}
					},
				},
			],
		},
	} satisfies BetterAuthPlugin;
};
