import { defineErrorCodes } from "@better-auth/core/utils";

export const SIWE_ERROR_CODES = defineErrorCodes({
	INVALID_OR_EXPIRED_NONCE: "Invalid or expired nonce",
	INVALID_SIWE_SIGNATURE: "Invalid SIWE signature",
	WALLET_ALREADY_LINKED: "Wallet already linked to another user",
});
