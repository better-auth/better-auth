import { betterFetch, type RequestContext } from "@better-fetch/fetch";
import type { BetterAuthClientPlugin } from "better-auth";
import type { Account } from "viem";
import { ChainIdToNetwork, PaymentRequirementsSchema } from "x402/types";
import { evm } from "x402/types";
import { createPaymentHeader, selectPaymentRequirements } from "x402/client";
import type { PaymentRequirementsSelector } from "x402/client";

export const x402Client = ({
	walletClient,
	onPayment
}: {
	walletClient: typeof evm.SignerWallet | Account;
	onPayment?: (request: RequestContext<any>) => Promise<void>;
}) => {
	return {
		id: "x402",
		fetchPlugins: [
			{
				id: "x402",
				name: "X402",
				hooks: {
					async onResponse(context) {
						if (context.response.status !== 402) {
							return context.response;
						}

						const { x402Version, accepts } =
							(await context.response.json()) as {
								x402Version: number;
								accepts: unknown[];
							};

						const parsedPaymentRequirements = accepts.map((x) =>
							PaymentRequirementsSchema.parse(x),
						);

						const chainId = evm.isSignerWallet(walletClient)
							? walletClient.chain?.id
							: evm.isAccount(walletClient)
								? walletClient.client?.chain?.id
								: undefined;
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
						context.request.headers.set("Access-Control-Expose-Headers", "X-PAYMENT-RESPONSE");

						// Some way to refetch the request

						onPayment?.(context.request);
						return fetch() // TODO: Refetch the request with the new payment header, then return the response.
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
