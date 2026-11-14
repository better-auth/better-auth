import type {
	CimdClientCreatedEvent,
	CimdClientRefreshedEvent,
	CimdMetadataResolution,
	CimdMetadataResolver,
	CimdMetadataValidationOptions,
	CimdMetadataValidationResult,
	CimdOptions,
} from "@better-auth/cimd";
import type {
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

describe("public CIMD surface", () => {
	it("exports the canonical discovery and validation vocabulary", () => {
		expect(cimdExports).toHaveProperty("createCimdClientDiscovery");
		expect(cimdExports).toHaveProperty("createCimdMetadataResolver");
		expect(cimdExports).toHaveProperty("isCimdClientIdUrlCandidate");
		expect(cimdExports).not.toHaveProperty("cimdClientDiscovery");
		expect(cimdExports).not.toHaveProperty("isUrlClientId");
		expectTypeOf<CimdMetadataValidationOptions>().toHaveProperty(
			"originBoundFields",
		);
		expectTypeOf<CimdOptions>().toHaveProperty("metadataRevalidationInterval");
		expectTypeOf<CimdOptions>().toHaveProperty("metadataResolver");
		expectTypeOf<CimdOptions>().not.toHaveProperty("refreshRate");
		expectTypeOf<CimdMetadataResolution>().toHaveProperty("metadata");
		expectTypeOf<CimdMetadataResolution>().toHaveProperty("isFresh");
		expectTypeOf<CimdMetadataResolver>().toBeCallableWith(
			"https://client.example/metadata.json",
		);
		void assertValidationResultNarrowing;
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
