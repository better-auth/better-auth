import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
	BetterAuthClientOptions,
	BetterAuthOptions,
} from "@better-auth/core";
import { toNodeHandler } from "../integrations/node";
import { getTestInstance } from "./test-instance";

/** A Node request handler that can be installed on an HTTP test listener. */
export type HttpTestRequestHandler = (
	req: IncomingMessage,
	res: ServerResponse,
) => unknown | Promise<unknown>;

/** A bound HTTP test listener whose request handler can be installed later. */
export type HttpTestServer = {
	url: string;
	address: AddressInfo;
	server: ReturnType<typeof createServer>;
	setRequestHandler: (handler: HttpTestRequestHandler) => void;
	close: () => Promise<void>;
};

type GetTestInstanceConfig = NonNullable<Parameters<typeof getTestInstance>[1]>;

export type HttpTestInstanceConfig<C extends BetterAuthClientOptions> = Omit<
	GetTestInstanceConfig,
	"port" | "clientOptions"
> & {
	clientOptions?: C;
	/**
	 * Customizes the HTTP request listener. Receives the bound auth instance
	 * and returns a Node request handler. Defaults to
	 * `toNodeHandler(auth.handler)`.
	 *
	 * Use this when the test needs to expose extra routes alongside the auth
	 * handler (e.g. a `.well-known/openid-configuration` shim that calls
	 * `auth.api.getOpenIdConfig()`).
	 */
	handler?: (
		auth: Awaited<ReturnType<typeof getTestInstance>>["auth"],
	) => HttpTestRequestHandler;
};

const closeHttpServer = (server: ReturnType<typeof createServer>) =>
	new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});

const endUnhandledErrorResponse = (res: ServerResponse, error: unknown) => {
	if (res.writableEnded || res.destroyed) {
		return;
	}
	if (res.headersSent) {
		res.end();
		return;
	}
	res.statusCode = 500;
	res.end(error instanceof Error ? error.message : "Internal Server Error");
};

/**
 * Binds an HTTP listener to an OS-assigned port before the final request
 * handler exists. This lets tests construct URL-sensitive applications only
 * after the listener owns its port, then install the application handler.
 */
export async function createHttpTestServer(): Promise<HttpTestServer> {
	let activeHandler: HttpTestRequestHandler = (_req, res) => {
		res.statusCode = 503;
		res.end("Test HTTP listener has no handler bound yet");
	};

	const nodeServer = createServer((req, res) => {
		void Promise.resolve(activeHandler(req, res)).catch((error: unknown) => {
			endUnhandledErrorResponse(res, error);
		});
	});
	await new Promise<void>((resolve, reject) => {
		const onError = (error: Error) => {
			nodeServer.off("listening", onListening);
			reject(error);
		};
		const onListening = () => {
			nodeServer.off("error", onError);
			resolve();
		};
		nodeServer.once("error", onError);
		nodeServer.once("listening", onListening);
		nodeServer.listen(0, "127.0.0.1");
	});

	const address = nodeServer.address();
	if (!address || typeof address === "string") {
		await closeHttpServer(nodeServer);
		throw new Error(
			"HTTP test listener did not report a bound port for the test listener",
		);
	}

	return {
		url: `http://127.0.0.1:${address.port}`,
		address,
		server: nodeServer,
		setRequestHandler(handler) {
			activeHandler = handler;
		},
		close: () => closeHttpServer(nodeServer),
	};
}

/**
 * Like `getTestInstance`, but bound to an actual HTTP listener on an
 * OS-assigned port (`port: 0`). The discovered URL is fed back into the auth
 * instance so its `baseURL` matches the listener.
 *
 * This removes the race window that the temp-server-then-rebind pattern
 * introduces. The listener is bound once, holds the port for its lifetime,
 * and only swaps in the real request handler after the auth instance is
 * fully constructed.
 *
 * The caller is responsible for calling `server.close()` in `afterAll`. Any
 * `baseURL` passed in `options` is ignored — the URL must match the
 * listener.
 */
export async function getHttpTestInstance<
	O extends Partial<BetterAuthOptions>,
	C extends BetterAuthClientOptions,
>(options?: O, config?: HttpTestInstanceConfig<C>) {
	const server = await createHttpTestServer();
	const baseURL = server.url;

	try {
		const instance = await getTestInstance(
			{ ...(options as object), baseURL } as O,
			{
				clientOptions: config?.clientOptions as never,
				disableTestUser: config?.disableTestUser,
				testUser: config?.testUser,
				testWith: config?.testWith,
			},
		);
		server.setRequestHandler(
			config?.handler
				? config.handler(instance.auth as never)
				: toNodeHandler(instance.auth.handler),
		);
		return { ...instance, server, baseURL, port: server.address.port };
	} catch (error) {
		await server.close();
		throw error;
	}
}
