import { z } from "zod";
import { logger } from "better-auth";
import { PAYMENT_ERRORS, type X402Config, type X402Endpoints } from "./index";
import {
	createAuthEndpoint,
	createAuthMiddleware,
	getSessionFromCtx,
	APIError,
	type AuthEndpoint,
} from "better-auth/api";
import {
	type Network,
	type PaymentPayload,
	type PaymentRequirements,
	type Price,
	type Resource,
	settleResponseHeader,
} from "x402/types";
import { exact } from "x402/schemes";
import { processPriceToAtomicAmount } from "x402/shared";
import type { useFacilitator } from "x402/verify";

const x402Version = 1;

export type Verify = ReturnType<typeof useFacilitator>["verify"];
export type Settle = ReturnType<typeof useFacilitator>["settle"];

export const getHooks = (
	endpoints: X402Endpoints,
	verify: Verify,
	settle: Settle,
	config: X402Config
) => {
	return createAuthMiddleware(async (ctx) => {
		for (const path in endpoints) {
			const endpoint = endpoints[path as keyof X402Endpoints];
			const url = ctx.request?.url as `${string}://${string}` | undefined;
			if(!url) return;
			const pathname = new URL(url).pathname;
			const session = await getSessionFromCtx(ctx);
			if (pathname === `${path}`) {
				if (endpoint.protect && !session) {
					throw new APIError("UNAUTHORIZED", {
						message: "You must be logged in to access this resource.",
					});
				}

				const price =
					typeof endpoint.price === "function"
						? await endpoint.price(session!)
						: endpoint.price;

				const paymentRequirements = [
					createExactPaymentRequirements(
						price,
						endpoint.network || "base-sepolia",
						url,
						config.wallet,
						endpoint.description || "",
					),
				];

				const paymentHeader = ctx.headers?.get("X-PAYMENT");

				const result = await verifyPayment(
					paymentHeader,
					paymentRequirements,
					verify,
				);

				if (result.isSuccessful === false) {
					logger.error(`[x402] Payment verification failed:`, result);
					throw new APIError("PAYMENT_REQUIRED", {
						message: result.error,
						code: result.errorCode,
						accepts: result.accepts,
						x402Version: result.x402Version,
					});
				}

				const { error } = await tryCatch(
					(async () => {
						const settleResponse = await settle(
							exact.evm.decodePayment(paymentHeader!),
							paymentRequirements[0],
						);

						const responseHeader = settleResponseHeader(settleResponse);

						ctx.setHeader("X-PAYMENT-RESPONSE", responseHeader);
					})(),
				);

				if (error) {
					throw new APIError("PAYMENT_REQUIRED", {
						message: error?.message,
					});
				}
			}
		}
	});
};

export const x402Middleware = (
	endpoints: X402Endpoints,
	verify: Verify,
	settle: Settle,
) =>
	createAuthEndpoint(
		"/x402/middleware",
		{
			method: "POST",
			body: z.object({
				full_url: z.string().url(),
			}),
		},
		async (ctx) => {
			const { full_url } = ctx.body;

			if (new URL(full_url).pathname in endpoints) {
				const endpoint =
					endpoints[new URL(full_url).pathname as keyof X402Endpoints];
				const session = await getSessionFromCtx(ctx);
				if (endpoint.protect && !session) {
					throw new APIError("UNAUTHORIZED", {
						message: "You must be logged in to access this resource.",
					});
				}

				const price =
					typeof endpoint.price === "function"
						? await endpoint.price(session!)
						: endpoint.price;

				const paymentRequirements = [
					createExactPaymentRequirements(
						price,
						endpoint.network || "base-sepolia",
						full_url as `${string}://${string}`,
						endpoint.description || "",
					),
				];

				const paymentHeader = ctx.headers?.get("X-PAYMENT");

				const result = await verifyPayment(
					paymentHeader,
					paymentRequirements,
					verify,
				);

				if (result.isSuccessful === false) {
					throw new APIError("PAYMENT_REQUIRED", {
						message: result.error,
						code: result.errorCode,
					});
				}

				const settleResponse = await settle(
					exact.evm.decodePayment(paymentHeader!),
					paymentRequirements[0],
				);

				const responseHeader = settleResponseHeader(settleResponse);

				return ctx.json({
					/**
					 * Set this to the `X-PAYMENT-RESPONSE` header
					 */
					responseHeader,
				});
			}
			return ctx.json({
				responseHeader: null,
			});
		},
	);

/**
 * Creates payment requirements for a given price and network
 *
 * @param price - The price to be paid for the resource
 * @param network - The blockchain network to use for payment
 * @param resource - The resource being accessed
 * @param payTo - The payment wallet address to pay to
 * @param description - Optional description of the payment
 * @returns An array of payment requirements
 */
export function createExactPaymentRequirements(
	price: Price,
	network: Network,
	resource: Resource,
	payTo: string,
	description = "",
): PaymentRequirements {
	const atomicAmountForAsset = processPriceToAtomicAmount(price, network);
	if ("error" in atomicAmountForAsset) {
		throw new Error(atomicAmountForAsset.error);
	}
	const { maxAmountRequired, asset } = atomicAmountForAsset;

	return {
		scheme: "exact",
		network,
		maxAmountRequired,
		resource,
		description,
		mimeType: "",
		payTo: payTo,
		maxTimeoutSeconds: 60,
		asset: asset.address,
		outputSchema: undefined,
		extra: {
			name: asset.eip712.name,
			version: asset.eip712.version,
		},
	};
}

/**
 * Verifies a payment and handles the response
 *
 * @param req - The Express request object
 * @param res - The Express response object
 * @param paymentRequirements - The payment requirements to verify against
 * @returns A promise that resolves to true if payment is valid, false otherwise
 */
export async function verifyPayment(
	/**
	 * The payment header to verify
	 *
	 * @example req.header["X-PAYMENT"]
	 */
	payment: string | null | undefined,
	paymentRequirements: PaymentRequirements[],
	verify: Verify,
): Promise<{
	isSuccessful: boolean;
	errorCode?: keyof typeof PAYMENT_ERRORS | undefined;
	error?:
		| (typeof PAYMENT_ERRORS)[keyof typeof PAYMENT_ERRORS]
		| (string & {})
		| undefined;
	accepts?: PaymentRequirements[];
	payer?: string;
	x402Version: number;
}> {
	if (!payment) {
		return {
			isSuccessful: false,
			accepts: paymentRequirements,
			error: PAYMENT_ERRORS.MISSING_PAYMENT_HEADER,
			errorCode: "MISSING_PAYMENT_HEADER",
			x402Version,
		};
	}

	let decodedPayment: PaymentPayload;
	try {
		decodedPayment = exact.evm.decodePayment(payment);
		decodedPayment.x402Version = x402Version;
	} catch (error: any) {
		logger.error(`[x402] Invalid payment header:`, error);
		return {
			isSuccessful: false,
			accepts: paymentRequirements,
			error: PAYMENT_ERRORS.INVALID_PAYMENT_HEADER,
			errorCode: "INVALID_PAYMENT_HEADER",
			x402Version,
		};
	}

	try {
		const response = await verify(decodedPayment, paymentRequirements[0]);
		if (!response.isValid) {
			logger.error(`[x402] Errored while trying to verify payment:`, response);
			return {
				isSuccessful: false,
				accepts: paymentRequirements,
				error:
					response.invalidReason === "insufficient_funds"
						? PAYMENT_ERRORS.INSUFFICIENT_FUNDS
						: response.invalidReason === "invalid_scheme"
							? PAYMENT_ERRORS.INVALID_SCHEME
							: PAYMENT_ERRORS.INVALID_NETWORK,
				errorCode:
					response.invalidReason === "insufficient_funds"
						? "INSUFFICIENT_FUNDS"
						: response.invalidReason === "invalid_scheme"
							? "INVALID_SCHEME"
							: "INVALID_NETWORK",
				payer: response.payer,
				x402Version,
			};
		}
	} catch (error: any) {
		logger.error(
			`[x402] Errored while trying to verify payment for unknown reasons:`,
			error,
		);
		return {
			isSuccessful: false,
			accepts: paymentRequirements,
			error: PAYMENT_ERRORS.FAILED_TO_VERIFY_FOR_UNKNOWN_REASONS,
			errorCode: "FAILED_TO_VERIFY_FOR_UNKNOWN_REASONS",
			x402Version,
		};
	}

	return { isSuccessful: true, x402Version };
}

type Success<T> = {
	data: T;
	error: null;
};

type Failure<E> = {
	data: null;
	error: E;
};

type Result<T, E = Error> = Success<T> | Failure<E>;

export async function tryCatch<T, E = Error>(
	promise: Promise<T>,
): Promise<Result<T, E>> {
	try {
		const data = await promise;
		return { data, error: null };
	} catch (error) {
		return { data: null, error: error as E };
	}
}
