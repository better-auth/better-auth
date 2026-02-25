import type { CredentialDeviceType } from "@simplewebauthn/server";
import type { InferOptionSchema } from "better-auth/types";
import type { schema } from "./schema";

/**
 * @internal
 */
export interface WebAuthnChallengeValue {
	expectedChallenge: string;
	userData: {
		id: string;
	};
}

export interface PasskeyOptions {
	/**
	 * A unique identifier for your website. 'localhost' is okay for
	 * local dev
	 *
	 * @default "localhost"
	 */
	rpID?: string | undefined;
	/**
	 * Human-readable title for your website
	 *
	 * @default "Better Auth"
	 */
	rpName?: string | undefined;
	/**
	 * The URL at which registrations and authentications should occur.
	 * `http://localhost` and `http://localhost:PORT` are also valid.
	 * Do NOT include any trailing /
	 *
	 * if this isn't provided. The client itself will
	 * pass this value.
	 */
	origin?: (string | string[] | null) | undefined;
	/**
	 * Allow customization of the authenticatorSelection options
	 * during passkey registration.
	 */
	authenticatorSelection?: AuthenticatorSelectionCriteria | undefined;
	/**
	 * Advanced options
	 */
	advanced?:
		| {
				/**
				 * Cookie name for storing WebAuthn challenge ID during authentication flow
				 *
				 * @default "better-auth-passkey"
				 */
				webAuthnChallengeCookie?: string;
		  }
		| undefined;
	/**
	 * Schema for the passkey model
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
}

export type Passkey = {
	id: string;
	name?: string | undefined;
	publicKey: string;
	userId: string;
	credentialID: string;
	counter: number;
	deviceType: CredentialDeviceType;
	backedUp: boolean;
	transports?: string | undefined;
	createdAt: Date;
	aaguid?: string | undefined;
};
