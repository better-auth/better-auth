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
	 *
	 * @cli
	 * @question What is a unique identifier for your website? 'localhost' is okay for local dev
	 * @type string
	 */
	rpID?: string | undefined;
	/**
	 * Human-readable title for your website
	 *
	 * @default "Better Auth"
	 *
	 * @cli
	 * @question What is a human-readable title for your website?
	 * @type string
	 */
	rpName?: string | undefined;
	/**
	 * The URL at which registrations and authentications should occur.
	 * `http://localhost` and `http://localhost:PORT` are also valid.
	 * Do NOT include any trailing /
	 *
	 * if this isn't provided. The client itself will
	 * pass this value.
	 *
	 * @cli
	 * @question What is the origin URL at which your better-auth server is hosted?
	 * @type string
	 */
	origin?: (string | string[] | null) | undefined;

	/**
	 * Allow customization of the authenticatorSelection options
	 * during passkey registration.
	 *
	 * @cli
	 */
	authenticatorSelection?: AuthenticatorSelectionCriteria | undefined;

	/**
	 * Advanced options
	 */
	advanced?:
		| {
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
