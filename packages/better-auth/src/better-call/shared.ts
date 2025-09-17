/**
 * Shared functions for both client and server
 */
import type { EndpointOptions } from "better-call";

/**
 * @experimental
 */
export type EndpointDefinition<
	Path extends string,
	Options extends EndpointOptions,
> = {
	path: Path;
	options: Options;
};

/**
 * Declare an endpoint without a handler, useful for sharing endpoint definitions between client and server.
 *
 * @experimental
 */
export function declareEndpoint<
	Path extends string,
	Options extends EndpointOptions,
>(path: Path, options: Options): EndpointDefinition<Path, Options> {
	return {
		path,
		options,
	};
}
