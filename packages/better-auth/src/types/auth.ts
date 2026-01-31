import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { router } from "../api";
import type { InferAPI } from "./api";
import type { InferPluginTypes, Session, User } from "./models";
import type { InferPluginErrorCodes } from "./plugins";

export type Auth<Options extends BetterAuthOptions = BetterAuthOptions> = {
	handler: (request: Request) => Promise<Response>;
	api: InferAPI<ReturnType<typeof router<Options>>["endpoints"]>;
	options: Options;
	$ERROR_CODES: InferPluginErrorCodes<Options> & typeof BASE_ERROR_CODES;
	$context: Promise<AuthContext<Options>>;
	/**
	 * Share types
	 */
	$Infer: InferPluginTypes<Options> extends {
		Session: any;
	}
		? InferPluginTypes<Options>
		: {
				Session: {
					session: Session<Options["session"], Options["plugins"]>;
					user: User<Options["user"], Options["plugins"]>;
				};
			} & InferPluginTypes<Options>;
};
