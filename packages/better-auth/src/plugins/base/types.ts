/**
 * Base Plugin Type Definitions
 */

export interface BasePluginOptions {
	/**
	 * Domain for SIWE message generation
	 * @default current domain
	 */
	domain?: string;
	/**
	 * Email domain for user creation (when anonymous is false)
	 * @default current domain
	 */
	emailDomainName?: string;
	/**
	 * Allow anonymous sign-in without email
	 * @default true
	 */
	anonymous?: boolean;
	/**
	 * Custom nonce generator
	 * @default crypto.randomUUID
	 */
	getNonce?: () => Promise<string>;
	/**
	 * ENS/Basename lookup for user profile
	 */
	ensLookup?: (args: { walletAddress: string }) => Promise<{
		name?: string;
		avatar?: string;
	}>;
}

export interface BaseAccountCapabilities {
	signInWithEthereum: {
		nonce: string;
		chainId: string;
	};
}

export interface BaseWalletConnectParams {
	version: "1";
	capabilities: BaseAccountCapabilities;
}

export interface BaseWalletConnectResult {
	accounts: Array<{
		address: string;
		capabilities: {
			signInWithEthereum: {
				message: string;
				signature: string;
			};
		};
	}>;
}

export interface BaseSignInResult {
	address: string;
	message: string;
	signature: string;
	chainId: number;
}

export interface BaseProvider {
	request: (args: {
		method: "wallet_connect";
		params: [BaseWalletConnectParams];
	}) => Promise<BaseWalletConnectResult>;
}
