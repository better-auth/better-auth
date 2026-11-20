import type {
	CimdClientCreatedEvent,
	CimdClientRefreshedEvent,
	CimdMetadataResolution,
	CimdMetadataResolver,
	CimdMetadataResolverOptions,
	CimdMetadataValidationOptions,
	CimdMetadataValidationResult,
	CimdOptions,
	CimdOwnedResolverOptions,
	CimdSharedResolverOptions,
} from "@better-auth/cimd";
import type { GenericEndpointContext } from "@better-auth/core";
import type {
	ClientDiscovery,
	ClientMetadataResourceFetch,
	OAuthClientMetadata,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as cimdExports from "./index";

function assertValidationResultNarrowing(
	validation: CimdMetadataValidationResult,
) {
	if (validation.valid) {
		expectTypeOf(validation.metadata).toEqualTypeOf<OAuthClientMetadata>();
		expectTypeOf(validation.error).toEqualTypeOf<undefined>();
	} else {
		expectTypeOf(validation.error).toEqualTypeOf<string>();
		expectTypeOf(validation.metadata).toEqualTypeOf<undefined>();
	}
}

/**
 * The transport and the fetch and validation options are configured once:
 * on the plugin, or on the shared resolver that the plugin then uses.
 */
function assertSharedResolverConfiguration(
	fetchClientMetadataResource: ClientMetadataResourceFetch,
) {
	cimdExports.cimd({ fetchClientMetadataResource });
	const metadataResolver = cimdExports.createCimdMetadataResolver({
		fetchClientMetadataResource,
		isMetadataDocumentUrlAllowed: () => true,
	});
	cimdExports.cimd({ metadataResolver, onClientCreated: () => {} });
	// @ts-expect-error the shared resolver carries the transport
	cimdExports.cimd({ metadataResolver, fetchClientMetadataResource });
	// @ts-expect-error the shared resolver owns the URL policy
	cimdExports.cimd({
		metadataResolver,
		isMetadataDocumentUrlAllowed: () => true,
	});
	// @ts-expect-error a plugin needs a transport or a shared resolver
	cimdExports.cimd({});
}

describe("public CIMD surface", () => {
	it("exports the canonical discovery and validation vocabulary", () => {
		expect(cimdExports).toHaveProperty("createCimdClientDiscovery");
		expect(cimdExports).toHaveProperty("isCimdClientIdUrlCandidate");
		expect(cimdExports).not.toHaveProperty("cimdClientDiscovery");
		expect(cimdExports).not.toHaveProperty("isUrlClientId");
		expectTypeOf<CimdMetadataValidationOptions>().toHaveProperty(
			"originBoundFields",
		);
		expectTypeOf<CimdOptions>().toHaveProperty("metadataRevalidationInterval");
		expectTypeOf<CimdOptions>().not.toHaveProperty("refreshRate");
		expectTypeOf<CimdOptions["isCrossOriginJwksUriAllowed"]>().toEqualTypeOf<
			ClientDiscovery["isCrossOriginJwksUriAllowed"]
		>();
		void assertValidationResultNarrowing;
	});

	it("exports one metadata resolver for sharing a cache across discoveries", () => {
		expect(cimdExports).toHaveProperty("createCimdMetadataResolver");
		expect(cimdExports).not.toHaveProperty(
			"createCimdMetadataResolver.resolve",
		);
		expectTypeOf(
			cimdExports.createCimdMetadataResolver,
		).parameters.toEqualTypeOf<[CimdMetadataResolverOptions]>();
		expectTypeOf(
			cimdExports.createCimdMetadataResolver,
		).returns.toEqualTypeOf<CimdMetadataResolver>();
		expectTypeOf<CimdMetadataResolver>().parameters.toEqualTypeOf<
			[GenericEndpointContext, string]
		>();
		expectTypeOf<CimdMetadataResolver>().returns.toEqualTypeOf<
			Promise<CimdMetadataResolution | null>
		>();
		expectTypeOf<
			CimdMetadataResolver["fetchClientMetadataResource"]
		>().toEqualTypeOf<ClientMetadataResourceFetch>();
		expectTypeOf<CimdMetadataResolution>().toEqualTypeOf<{
			metadata: OAuthClientMetadata;
			fromCache: boolean;
		}>();
		expectTypeOf<CimdOptions["metadataResolver"]>().toEqualTypeOf<
			CimdMetadataResolver | undefined
		>();
		expectTypeOf<CimdOptions>().toEqualTypeOf<
			CimdOwnedResolverOptions | CimdSharedResolverOptions
		>();
		expectTypeOf<
			CimdSharedResolverOptions["metadataResolver"]
		>().toEqualTypeOf<CimdMetadataResolver>();
		expectTypeOf<
			CimdOwnedResolverOptions["metadataResolver"]
		>().toEqualTypeOf<undefined>();
		expectTypeOf<CimdMetadataResolverOptions>().toHaveProperty(
			"fetchClientMetadataResource",
		);
		expectTypeOf<CimdMetadataResolverOptions>().not.toHaveProperty(
			"onClientCreated",
		);
		expectTypeOf<CimdMetadataResolverOptions>().not.toHaveProperty(
			"metadataResolver",
		);
		void assertSharedResolverConfiguration;
	});

	it("keeps the released policy callback signature", () => {
		expectTypeOf<
			NonNullable<CimdOptions["isMetadataDocumentUrlAllowed"]>
		>().parameters.toEqualTypeOf<[string, GenericEndpointContext]>();
	});

	it("exports named callback event contracts", () => {
		expectTypeOf<CimdClientCreatedEvent["client"]>().toEqualTypeOf<
			SchemaClient<Scope[]>
		>();
		expectTypeOf<CimdClientCreatedEvent>().toHaveProperty(
			"clientMetadataDocument",
		);
		expectTypeOf<CimdClientCreatedEvent>().toHaveProperty("context");
		expectTypeOf<CimdClientRefreshedEvent>().toHaveProperty("previousClient");
		expectTypeOf<CimdClientRefreshedEvent>().toHaveProperty("client");
	});
});
