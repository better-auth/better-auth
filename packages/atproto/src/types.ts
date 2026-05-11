import type { InferOptionSchema } from "better-auth/types";
import type { schema } from "./schema";

export interface AtprotoProfile {
	did: string;
	handle: string;
	displayName?: string;
	avatar?: string;
	banner?: string;
	description?: string;
}

export type MappedUserFields = Partial<{
	name: string;
	email: string;
	image: string;
}>;

export interface AtprotoAuthOptions {
	/**
	 * PEM-encoded ES256 private key for signing JWTs and DPoP proofs.
	 * Required for production. Optional for localhost development —
	 * atproto allows unauthenticated loopback clients.
	 *
	 * Generate with: openssl ecparam -name prime256v1 -genkey -noout
	 */
	privateKey?: string | undefined;

	clientMetadata?:
		| {
				/** Display name shown during authorization. Defaults to "Better Auth". */
				clientName?: string | undefined;
				/** OAuth scopes to request. Defaults to "atproto transition:generic". */
				scope?: string | undefined;
		  }
		| undefined;

	/**
	 * Customize how the atproto profile maps to better-auth user fields.
	 * Return a partial user object to override defaults.
	 */
	mapProfileToUser?:
		| ((profile: AtprotoProfile) => MappedUserFields)
		| undefined;

	/**
	 * When true, only allow sign-in for existing users. New users will
	 * receive a FORBIDDEN error instead of being created automatically.
	 */
	disableSignUp?: boolean | undefined;

	/**
	 * Schema overrides for the atproto plugin.
	 */
	schema?: InferOptionSchema<typeof schema> | undefined;
}

/**
 * User fields added by the atproto plugin.
 * Consumers see these as typed properties on `session.user`.
 */
export interface AtprotoUserFields {
	atprotoDid: string | null;
	atprotoHandle: string | null;
	atprotoBio: string | null;
	atprotoBanner: string | null;
}
