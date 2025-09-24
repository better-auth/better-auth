export interface AddressValidatorArgs {
	publicKey: string;
}

export interface GenerateMessageArgs {
	publicKey: string;
	nonce: string;
}

export interface VerifyMessageArgs {
	message: string;
	signature: string;
	publicKey: string;
}
