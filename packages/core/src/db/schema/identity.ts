import * as z from "zod";
import type { BetterAuthOptions, Prettify } from "../../types";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type";
import { coreSchema } from "./shared";

export const identitySchema = coreSchema.extend({
	userId: z.coerce.string(),
	issuer: z.string(),
	providerAccountId: z.string(),
});

export type BaseIdentity = z.infer<typeof identitySchema>;

/** The stable provider-side key used to recognize an identity. */
export type IdentityKey = Readonly<
	Pick<BaseIdentity, "issuer" | "providerAccountId">
>;

function encodeIdentityIssuerProviderId(providerId: string): string {
	return encodeURIComponent(providerId);
}

/**
 * Creates the synthetic issuer used by identity providers without an issuer of
 * their own.
 */
export function createLocalIdentityIssuer(providerId: string): string {
	return `local:${encodeIdentityIssuerProviderId(providerId)}`;
}

/**
 * Identity schema type used by Better Auth. Identities may include additional
 * application or plugin fields.
 */
export type Identity<
	DBOptions extends
		BetterAuthOptions["identity"] = BetterAuthOptions["identity"],
	Plugins extends BetterAuthOptions["plugins"] = BetterAuthOptions["plugins"],
> = Prettify<
	BaseIdentity &
		InferDBFieldsFromOptions<DBOptions> &
		InferDBFieldsFromPlugins<"identity", Plugins>
>;
