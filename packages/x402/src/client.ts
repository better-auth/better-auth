import { betterFetch, type RequestContext } from "@better-fetch/fetch";
import { APIError, logger, type BetterAuthClientPlugin } from "better-auth";
import { ContractFunctionExecutionError, type Account } from "viem";
import { ChainIdToNetwork, PaymentRequirementsSchema } from "x402/types";
import { evm } from "x402/types";
import { createPaymentHeader, selectPaymentRequirements } from "x402/client";

export const x402Client = ({
	walletClient,
	onPayment,
	isUnitTest = false,
}: {
	walletClient: typeof evm.SignerWallet | Account;
	onPayment?: (request: RequestContext<any>) => Promise<void>;
	isUnitTest?:
		| false
		| {
				customFetch: (request: Request) => Promise<Response>;
		  };
}) => {
	return {
		id: "x402",
		fetchPlugins: [
			{
				id: "x402",
				name: "X402",
				hooks: {
					async onResponse(context) {
						console.log(context.response.status);
						if (context.response.status !== 402) {
							return context.response;
						}

						const { accepts, x402Version } =
							(await context.response.json()) as {
								x402Version: number;
								accepts: unknown[];
								message: string;
								code: string;
							};

						if (!accepts || !x402Version) {
							return context.response;
						}
						const parsedPaymentRequirements = accepts.map((x) =>
							PaymentRequirementsSchema.parse(x),
						);
						let chainId: number | undefined;
						try {
							chainId = evm.isSignerWallet(walletClient)
								? walletClient.chain?.id
								: evm.isAccount(walletClient)
									? walletClient.client?.chain?.id
									: undefined;
						} catch (error) {
							logger.error(`[x402] Failed to get chainId:`, error);
							throw new APIError("INTERNAL_SERVER_ERROR", {
								message: "Failed to get chainId",
							});
						}

						const selectedPaymentRequirements = selectPaymentRequirements(
							parsedPaymentRequirements,
							chainId ? ChainIdToNetwork[chainId] : undefined,
							"exact",
						);

						const paymentHeader = await createPaymentHeader(
							walletClient,
							x402Version,
							selectedPaymentRequirements,
						);

						context.request.headers.set("X-PAYMENT", paymentHeader);
						context.request.headers.set(
							"Access-Control-Expose-Headers",
							"X-PAYMENT-RESPONSE",
						);

						onPayment?.(context.request);
						if (isUnitTest) {
							return await isUnitTest.customFetch(
								new Request(context.request.url, {
									...context.request,
								}),
							);
						}
						const response = await fetch(context.request.url, {
							...context.request,
						});
						return response;
					},
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};

export const x402Middleware = async ({
	full_url,
	headers,
}: { full_url: string; headers: Headers }) => {
	const { data, error } = await betterFetch<{
		responseHeader: string;
	}>("/api/auth/x402/middleware", {
		baseURL: new URL(full_url).origin,
		headers,
	});

	return { error, responseHeader: data?.responseHeader || null };
};
