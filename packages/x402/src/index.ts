import type { BetterAuthPlugin, Session, User } from "better-auth";
import { getHooks, x402Middleware as x402MiddlewareUtils } from "./utils";
import { useFacilitator } from "x402/verify";

export const PAYMENT_ERRORS = {
	MISSING_PAYMENT_HEADER: "X-PAYMENT header is required",
	INVALID_PAYMENT_HEADER: "Invalid or malformed payment header",
	INSUFFICIENT_FUNDS: "Insufficient funds",
	INVALID_SCHEME: "Invalid payment scheme",
	INVALID_NETWORK: "Invalid payment blockchain network",
	FAILED_TO_VERIFY_FOR_UNKNOWN_REASONS:
		"Failed to verify payment information for unknown reasons.",
	INVALID_ENDPOINT_PATH: "Invalid endpoint path during x402 payment.",
	FAILED_TO_PROCESS_PAYMENT_FOR_UNKNOWN_REASONS:
		"Failed to process payment for unknown reasons.",
} as const;

interface X402EndpointBase {
	/**
	 * The method to use for the endpoint.
	 * @default "GET"
	 */
	method?: "GET" | "POST";
	/**
	 * The name of the endpoint.
	 */
	name?: string;
	/**
	 * A description of the paywalled endpoint.
	 */
	description?: string;

	/**
	 * The blockchain network to use for the endpoint.
	 * @default "base-sepolia"
	 */
	network?: "base" | "base-sepolia";
}

interface X402EndpointProtected extends X402EndpointBase {
	/**
	 * Whether the endpoint is protected. Any request that is unauthenticated will not be able to access the endpoint.
	 * @default false
	 */
	protect?: true;
	/**
	 * A price in USDC.
	 *
	 * @example "$0.01"
	 */
	price:
		| `$${number}`
		| ((session: { user: User; session: Session }) =>
				| `$${number}`
				| Promise<`$${number}`>);
}

interface X402EndpointUnprotected extends X402EndpointBase {
	protect?: false;
	price:
		| `$${number}`
		| ((
				session: { user: User; session: Session } | null,
		  ) => `$${number}` | Promise<`$${number}`>);
}

type X402Endpoint = X402EndpointProtected | X402EndpointUnprotected;

export type X402Endpoints = Record<`/${string}`, X402Endpoint>;

export type X402Config = {
	/**
	 * Your receiving wallet address
	 */
	wallet: string;
	/**
	 * The URL of the facilitator for your blockchain network.
	 *
	 * @default "https://x402.org/facilitator" // Facilitator URL for Base Sepolia testnet.
	 */
	facilitatorURL?: `https://${string}`;
};

export const x402 = (endpoints: X402Endpoints, config: X402Config) => {
	const { verify, settle } = useFacilitator({
		url: config.facilitatorURL || "https://x402.org/facilitator",
	});
	return {
		id: "x402",
		init(ctx) {
			return {
				options: {
					hooks: {
						before: getHooks(endpoints, verify, settle),
					},
				},
			};
		},
		endpoints: {
			x402middleware: x402MiddlewareUtils(endpoints, verify, settle),
		},
	} satisfies BetterAuthPlugin;
};
