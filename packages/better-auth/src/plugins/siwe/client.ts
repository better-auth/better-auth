import type {
	BetterAuthClientPlugin,
	ClientFetchOption,
} from "@better-auth/core";
import { PACKAGE_VERSION } from "../../version";
import type { siwe } from ".";

type SiweGetNonceOptions = {
	/**
	 * Wallet address to generate a nonce for.
	 */
	walletAddress?: string | undefined;
	/**
	 * Alias for `walletAddress`.
	 */
	address?: string | undefined;
	chainId?: number | undefined;
	fetchOptions?: ClientFetchOption | undefined;
};

export const siweClient = () => {
	return {
		id: "siwe",
		version: PACKAGE_VERSION,
		$InferServerPlugin: {} as ReturnType<typeof siwe>,
		pathMethods: {
			"/siwe/nonce": "POST",
		},
		getActions: ($fetch) => ({
			siwe: {
				/**
				 * Generate a nonce for signing in with Ethereum.
				 */
				getNonce: async (
					options: SiweGetNonceOptions,
					fetchOptions?: ClientFetchOption | undefined,
				) => {
					const {
						address,
						chainId,
						fetchOptions: requestFetchOptions,
						walletAddress,
					} = options;

					return await $fetch<{ nonce: string }>("/siwe/nonce", {
						...requestFetchOptions,
						...fetchOptions,
						body: {
							walletAddress: walletAddress ?? address,
							...(chainId !== undefined ? { chainId } : {}),
						},
						method: "POST",
					});
				},
			},
		}),
	} satisfies BetterAuthClientPlugin;
};
