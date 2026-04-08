import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import type { router } from "../api";
import type { InferAPI } from "./api";
import type { InferPluginTypes, Session, User } from "./models";
import type { InferPluginContext, InferPluginErrorCodes } from "./plugins";

export type Auth<Options extends BetterAuthOptions = BetterAuthOptions> = {
	handler: (request: Request) => Promise<Response>;
	/**
	 * UI handler for serving plugin HTML pages.
	 * Mount this separately from the API handler at your preferred path.
	 *
	 * @example
	 * ```ts
	 * // Next.js - app/admin/[[...path]]/route.ts
	 * export const GET = auth.ui.handler;
	 *
	 * // Express
	 * app.all("/admin/*", (req, res) => auth.ui.handler(toWebRequest(req)));
	 *
	 * // Hono
	 * app.all("/admin/*", (c) => auth.ui.handler(c.req.raw));
	 * ```
	 */
	ui: {
		handler: (request: Request) => Promise<Response>;
	};
	api: InferAPI<ReturnType<typeof router<Options>>["endpoints"]>;
	options: Options;
	$ERROR_CODES: InferPluginErrorCodes<Options> & typeof BASE_ERROR_CODES;
	$context: Promise<AuthContext<Options> & InferPluginContext<Options>>;
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
