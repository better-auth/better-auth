import type { EndpointDefinition } from "./shared";
import { type EndpointContext, type EndpointOptions } from "better-call";
import { createAuthEndpoint } from "../api";
import type { AuthContext } from "../init";

export function implEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	definition: EndpointDefinition<Path, Options>,
	handler: (ctx: EndpointContext<Path, Options, AuthContext>) => Promise<R>,
) {
	return createAuthEndpoint(definition.path, definition.options, handler);
}
