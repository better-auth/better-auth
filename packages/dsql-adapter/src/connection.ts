import { logger } from "@better-auth/core/env";
import type {
	PostgresDialectConfig,
	PostgresPool,
	PostgresPoolClient,
} from "kysely";

const MAX_CONNECT_RETRIES = 3;
/** Connections idle for longer than this are checked before they're reused. */
const IDLE_CHECK_MS = 30_000;

const connectionErrorCodes = new Set([
	// Node socket errors
	"ECONNREFUSED",
	"ECONNRESET",
	"EPIPE",
	"ETIMEDOUT",
	"EAI_AGAIN",
	// Too many connections, or the cluster's connection rate limit
	"53300",
	"53400",
	// Server shutting down or not accepting connections yet
	"57P01",
	"57P02",
	"57P03",
]);

/**
 * Whether opening a connection failed for a reason that may go away on its
 * own. Authentication errors and the like are not included.
 *
 * @internal
 */
export function isConnectionError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	if ("code" in error && typeof error.code === "string") {
		// Class 08 is "connection exception".
		return connectionErrorCodes.has(error.code) || error.code.startsWith("08");
	}
	return (
		"message" in error && error.message === "Connection terminated unexpectedly"
	);
}

type ErrorEmitter = {
	on(event: "error", listener: (error: unknown) => void): unknown;
	listenerCount(event: "error"): number;
};

function isErrorEmitter(value: object): value is ErrorEmitter {
	return (
		"on" in value &&
		typeof value.on === "function" &&
		"listenerCount" in value &&
		typeof value.listenerCount === "function"
	);
}

/**
 * Wraps a node-postgres pool for DSQL, which closes connections after 60
 * minutes and limits how fast new ones can be opened:
 *
 * - Without an `error` listener, a dropped idle connection crashes the
 *   process, so one that logs is added if the pool has none.
 * - A connection that has been idle for a while (or was frozen with a Lambda)
 *   is checked with `select 1` and replaced if it's dead.
 * - Opening a connection is retried when it fails with a connection error.
 *
 * None of this runs a query from the app twice: everything happens before the
 * connection is handed out.
 *
 * @internal
 */
export function withConnectionChecks(pool: PostgresPool): PostgresPool {
	if (isErrorEmitter(pool) && pool.listenerCount("error") === 0) {
		pool.on("error", (error) => {
			logger.warn(
				"[Aurora DSQL] An idle connection was closed. A new one will be opened when it's needed.",
				error,
			);
		});
	}
	const lastReleased = new WeakMap<PostgresPoolClient, number>();
	const checkOut = (client: PostgresPoolClient) => {
		// node-postgres sets a new `release` on every checkout.
		const release = client.release.bind(client);
		client.release = () => {
			lastReleased.set(client, Date.now());
			release();
		};
		return client;
	};
	return {
		async connect() {
			for (let attempt = 0; ; attempt++) {
				let client: PostgresPoolClient;
				try {
					client = await pool.connect();
				} catch (error) {
					if (attempt >= MAX_CONNECT_RETRIES || !isConnectionError(error)) {
						throw error;
					}
					await new Promise((resolve) =>
						setTimeout(resolve, 50 * 2 ** attempt + Math.random() * 50),
					);
					continue;
				}
				const idleSince = lastReleased.get(client);
				if (idleSince === undefined || Date.now() - idleSince < IDLE_CHECK_MS) {
					return checkOut(client);
				}
				try {
					await client.query("select 1", []);
					return checkOut(client);
				} catch (error) {
					// Destroy it so the pool opens a new connection next time.
					const destroy: (destroy?: boolean) => void =
						client.release.bind(client);
					destroy(true);
					if (attempt >= MAX_CONNECT_RETRIES) throw error;
				}
			}
		},
		end: () => pool.end(),
	};
}

/**
 * Applies `withConnectionChecks` to a dialect config's pool.
 *
 * @internal
 */
export function withConnectionChecksConfig(
	config: PostgresDialectConfig,
): PostgresDialectConfig {
	const { pool } = config;
	return {
		...config,
		pool:
			typeof pool === "function"
				? async () => withConnectionChecks(await pool())
				: withConnectionChecks(pool),
	};
}
