import type { GenericEndpointContext } from "@better-auth/core";
import type {
	AuthenticationExtensionsClientInputs,
	AuthenticationResponseJSON,
	CredentialDeviceType,
	RegistrationResponseJSON,
	VerifiedAuthenticationResponse,
	VerifiedRegistrationResponse,
} from "@simplewebauthn/server";
import type { InferOptionSchema } from "better-auth/types";
import type { schema } from "./schema";

/**
 * @internal
 */
export interface WebAuthnChallengeValue {
	expectedChallenge: string;
	userData: {
		id: string;
		name?: string | undefined;
		displayName?: string | undefined;
	};
	context?: string | null;
}

type Awaitable<T> = T | Promise<T>;

export interface PasskeyRegistrationUser {
	id: string;
	name: string;
	displayName?: string | undefined;
}

export type PasskeyExtensionsResolver =
	| AuthenticationExtensionsClientInputs
	| ((args: {
			ctx: GenericEndpointContext;
	  }) => Awaitable<AuthenticationExtensionsClientInputs | undefined>);

export interface PasskeyRegistrationOptions {
	/**
	 * Require an authenticated session for passkey registration.
	 *
	 * @default true
	 */
	requireSession?: boolean | undefined;
	/**
	 * Resolve the user when session is not available.
	 * Required when `requireSession` is false and no session exists.
	 */
	resolveUser?:
		| ((args: {
				ctx: GenericEndpointContext;
				context?: string | null | undefined;
		  }) => Awaitable<PasskeyRegistrationUser>)
		| undefined;
	/**
	 * Callback after a successful registration verification.
	 * Useful for user linking or auditing.
	 */
	afterVerification?:
		| ((args: {
				ctx: GenericEndpointContext;
				verification: VerifiedRegistrationResponse;
				user: PasskeyRegistrationUser;
				clientData: RegistrationResponseJSON;
				context?: string | null | undefined;
		  }) => Awaitable<{ userId?: string } | void>)
		| undefined;
	/**
	 * Optional WebAuthn extensions to include in registration options.
	 */
	extensions?: PasskeyExtensionsResolver | undefined;
}

export interface PasskeyAuthenticationOptions {
	/**
	 * Optional WebAuthn extensions to include in authentication options.
	 */
	extensions?: PasskeyExtensionsResolver | undefined;
	/**
	 * Callback after a successful authentication verification.
	 */
	afterVerification?:
		| ((args: {
				ctx: GenericEndpointContext;
				verification: VerifiedAuthenticationResponse;
				clientData: AuthenticationResponseJSON;
		  }) => Awaitable<void>)
		| undefined;
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
	/**
	 * Registration behavior overrides
	 */
	registration?: PasskeyRegistrationOptions | undefined;
	/**
	 * Authentication behavior overrides
	 */
	authentication?: PasskeyAuthenticationOptions | undefined;
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
