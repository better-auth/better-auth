import { getEndpoints, router } from "./api";
import { init } from "./init";
import type { BetterAuthOptions } from "./types/options";
import type {
	InferPluginErrorCodes,
	InferPluginTypes,
	InferSession,
	InferUser,
	AuthContext,
	BetterAuthPlugin,
	User,
	Session,
	Account,
} from "./types";
import type {
	PrettifyDeep,
	Expand,
	LiteralString,
	OmitId,
} from "./types/helper";
import { getBaseURL, getOrigin } from "./utils/url";
import type { FilterActions, InferAPI } from "./types";
import { BASE_ERROR_CODES } from "./error/codes";
import { BetterAuthError } from "./error";
import type { FieldAttribute } from "./db";

export type WithJsDoc<T, D> = Expand<T & D>;

export function betterAuth<
	// Plugin inference
	Plugins extends BetterAuthPlugin[],
	// User model inference
	UserModelName extends LiteralString,
	UserFields extends Partial<Record<keyof OmitId<User>, LiteralString>>,
	UserAdditionalFields extends {
		[key: string]: FieldAttribute;
	},
	// Session model inference
	SessionModelName extends LiteralString,
	SessionFields extends Partial<Record<keyof OmitId<Session>, LiteralString>>,
	SessionAdditionalFields extends {
		[key: string]: FieldAttribute;
	},
	// Account model inference
	AccountModelName extends LiteralString,
	AccountFields extends Partial<Record<keyof OmitId<Account>, LiteralString>>,
>(
	options: BetterAuthOptions<
		Plugins,
		UserModelName,
		UserFields,
		UserAdditionalFields,
		SessionModelName,
		SessionFields,
		SessionAdditionalFields,
		AccountModelName,
		AccountFields
	>,
) {
	type O = typeof options;

	const authContext = init(
		//@ts-expect-error - Intentional. Errors because this `options` generics doesn't match the default generics in BetterAuthOptions
		options,
	);
	// The alternative to seeing this one "fake" error, is to provide every generic to build BetterAuthOptions for this `init` function,
	// but then we'd have to do that for every other function that uses BetterAuthOptions, which is quite inconvenient
	// Just easier to ts-ignore, given that this all works fine.

	const { api } = getEndpoints(
		authContext,
		//@ts-expect-error - Intentional. Read comments above.
		options,
	);
	const errorCodes = options.plugins?.reduce((acc, plugin) => {
		if (plugin.$ERROR_CODES) {
			return {
				...acc,
				...plugin.$ERROR_CODES,
			};
		}
		return acc;
	}, {});
	return {
		handler: async (request: Request) => {
			const ctx = await authContext;
			const basePath = ctx.options.basePath || "/api/auth";
			if (!ctx.options.baseURL) {
				const baseURL = getBaseURL(undefined, basePath, request);
				if (baseURL) {
					ctx.baseURL = baseURL;
					ctx.options.baseURL = getOrigin(ctx.baseURL) || undefined;
				} else {
					throw new BetterAuthError(
						"Could not get base URL from request. Please provide a valid base URL.",
					);
				}
			}
			ctx.trustedOrigins = [
				...(options.trustedOrigins
					? Array.isArray(options.trustedOrigins)
						? options.trustedOrigins
						: await options.trustedOrigins(request)
					: []),
				ctx.options.baseURL!,
			];
			const { handler } = router(
				ctx,
				//@ts-expect-error - Intentional. Read comments above.
				options,
			);
			return handler(request);
		},
		//@ts-expect-error - Intentional. Read comments above.
		api: api as InferAPI<typeof api>,
		options: options as O,
		$context: authContext,
		$Infer: {} as {
			Session: {
				session: PrettifyDeep<
					InferSession<//@ts-expect-error - Intentional. Read comments above.
					O>
				>;
				user: PrettifyDeep<
					InferUser<//@ts-expect-error - Intentional. Read comments above.
					O>
				>;
			};
		} & InferPluginTypes<//@ts-expect-error - Intentional. Read comments above.
		O>,
		$ERROR_CODES: {
			...errorCodes,
			...BASE_ERROR_CODES,
		} as InferPluginErrorCodes<//@ts-expect-error - Intentional. Read comments above.
		O> &
			typeof BASE_ERROR_CODES,
	};
}

export type Auth = {
	handler: (request: Request) => Promise<Response>;
	api: FilterActions<ReturnType<typeof router>["endpoints"]>;
	options: BetterAuthOptions;
	$ERROR_CODES: typeof BASE_ERROR_CODES;
	$context: Promise<AuthContext>;
};
