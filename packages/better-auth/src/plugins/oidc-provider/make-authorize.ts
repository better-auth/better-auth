import { APIError, getSessionFromCtx } from "../../api";
import type { GenericEndpointContext } from "../../types";
import type { AuthorizationQuery, Client, OIDCOptions } from "./types";

type MakeAuthorizeOpts = {
	disableCors: boolean;
};

const handleRedirect = ({
	ctx,
	url,
	request,
}: {
	ctx: GenericEndpointContext;
	url: string;
	request: Request;
}) => {
	const fromFetch = request.headers.get("sec-fetch-mode") === "cors";
	if (fromFetch) {
		return ctx.json({
			redirect: true,
			url,
		});
	} else {
		throw ctx.redirect(url);
	}
};

const formatErrorURL = (url: string, error: string, description: string) => {
	return `${
		url.includes("?") ? "&" : "?"
	}error=${error}&error_description=${description}`;
};

const getErrorURL = (
	ctx: GenericEndpointContext,
	error: string,
	description: string,
) => {
	const baseURL =
		ctx.context.options.onAPIError?.errorURL || `${ctx.context.baseURL}/error`;
	const formattedURL = formatErrorURL(baseURL, error, description);
	return formattedURL;
};

const disableCorsFn = (ctx: GenericEndpointContext) => {
	ctx.setHeader("Access-Control-Allow-Origin", "*");
	ctx.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	ctx.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	ctx.setHeader("Access-Control-Max-Age", "86400");
};

const createOpts = (options: OIDCOptions) => ({
	codeExpiresIn: 600,
	defaultScope: "openid",
	...options,
	scopes: [
		"openid",
		"profile",
		"email",
		"offline_access",
		...(options?.scopes || []),
	],
});

const getSessionOrLogin = async ({
	ctx,
	request,
	loginPage,
}: {
	ctx: GenericEndpointContext;
	loginPage: string;
	request: Request;
}) => {
	const session = await getSessionFromCtx(ctx);
	if (!session) {
		/**
		 * If the user is not logged in, we need to redirect them to the
		 * login page.
		 */
		await ctx.setSignedCookie(
			"oidc_login_prompt",
			JSON.stringify(ctx.query),
			ctx.context.secret,
			{
				maxAge: 600,
				path: "/",
				sameSite: "lax",
			},
		);

		const queryFromURL = request.url?.split("?")[1];
		throw await handleRedirect({
			ctx,
			request,
			url: `${loginPage}?${queryFromURL}`,
		});
	}

	return session;
};

const getClientId = ({
	ctx,
	query,
	request,
}: {
	ctx: GenericEndpointContext;
	request: Request;
	query: AuthorizationQuery;
}) => {
	if (!query.client_id) {
		const errorURL = getErrorURL(
			ctx,
			"invalid_client",
			"client_id is required",
		);
		throw handleRedirect({
			ctx,
			request,
			url: errorURL,
		});
	}

	return query.client_id;
};

const getResponseType = ({
	ctx,
	query,
	request,
}: {
	ctx: GenericEndpointContext;
	request: Request;
	query: AuthorizationQuery;
}) => {
	if (!query.response_type) {
		const errorURL = getErrorURL(
			ctx,
			"invalid_request",
			"response_type is required",
		);
		throw handleRedirect({
			ctx,
			request,
			url: errorURL,
		});
	}

	return query.response_type;
};

/**
 * Get a client by ID, checking trusted clients first, then database
 */
export async function getClient(
	clientId: string,
	adapter: any,
	trustedClients: (Client & { skipConsent?: boolean })[] = [],
): Promise<(Client & { skipConsent?: boolean }) | null> {
	const trustedClient = trustedClients.find(
		(client) => client.clientId === clientId,
	);
	if (trustedClient) {
		return trustedClient;
	}
	const dbClient = await adapter
		.findOne({
			model: "oauthApplication",
			where: [{ field: "clientId", value: clientId }],
		})
		.then((res: Record<string, any> | null) => {
			if (!res) {
				return null;
			}
			return {
				...res,
				redirectURLs: (res.redirectURLs ?? "").split(","),
				metadata: res.metadata ? JSON.parse(res.metadata) : {},
			} as Client;
		});

	return dbClient;
}

export const makeAuthorize =
	({ disableCors }: MakeAuthorizeOpts) =>
	async (ctx: GenericEndpointContext, options: OIDCOptions) => {
		if (disableCors) disableCorsFn(ctx);

		const opts = createOpts(options);

		if (!ctx.request) {
			throw new APIError("UNAUTHORIZED", {
				error_description: "request not found",
				error: "invalid_request",
			});
		}

		const session = await getSessionOrLogin({
			ctx,
			request: ctx.request,
			loginPage: options.loginPage,
		});

		const query = ctx.query as AuthorizationQuery;
		const clientId = getClientId({ ctx, query, request: ctx.request });
		const responseType = getResponseType({ ctx, query, request: ctx.request });

		const trustedClients = options.trustedClients || [];

		const client = await getClient(
			clientId.toString(),
			ctx.context.adapter,
			trustedClients,
		);
	};
