import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { router } from "../api";
import type { InferAPI } from "./api";
import type { PrettifyDeep } from "./helper";
import type { InferPluginTypes, InferSession, InferUser } from "./models";
import type { InferPluginErrorCodes } from "./plugins";

export type Auth<Options extends BetterAuthOptions = BetterAuthOptions> = {
	handler: (request: Request) => Promise<Response>;
	api: InferAPI<ReturnType<typeof router<Options>>["endpoints"]>;
	options: Options;
	$ERROR_CODES: InferPluginErrorCodes<Options> & typeof BASE_ERROR_CODES;
	$context: Promise<AuthContext>;
	/**
	 * Share types
	 */
	$Infer: InferPluginTypes<Options> extends {
		Session: any;
	}
		? InferPluginTypes<Options>
		: {
				Session: {
					session: PrettifyDeep<InferSession<Options>>;
					user: PrettifyDeep<InferUser<Options>>;
				};
			} & InferPluginTypes<Options>;
};
