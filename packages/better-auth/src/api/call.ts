import {
	createEndpointCreator,
	createMiddlewareCreator,
	Endpoint,
	EndpointResponse,
} from "better-call";
import { BetterAuthOptions } from "../types/options";
import { AuthContext } from "../init";

export const createAuthEndpoint = createEndpointCreator<AuthContext>();
export const createAuthMiddleware = createMiddlewareCreator<AuthContext>();

export type AuthEndpoint = Endpoint<
	(ctx: {
		options: BetterAuthOptions;
		body: any;
		query: any;
	}) => Promise<EndpointResponse>
>;

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
