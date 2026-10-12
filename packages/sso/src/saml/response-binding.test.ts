import { describe, expect, it } from "vitest";
import {
	getSAMLPostAssertionConsumerServiceUrls,
	hasSAMLEncryptedAssertion,
	parseSAMLServiceProviderMetadata,
	validateSAMLResponseBinding,
} from "./response-binding";

const serviceProviderEntityId = "https://sp.example.com/metadata";
const serviceProviderAcsUrl = "https://sp.example.com/sso/acs";
const otherServiceProvider = "https://other.example.com/metadata";

function buildAudienceRestrictions(audienceGroups: string[][]): string {
	return audienceGroups
		.map(
			(audiences) => `
				<saml:AudienceRestriction>
					${audiences
						.map((audience) => `<saml:Audience>${audience}</saml:Audience>`)
						.join("")}
				</saml:AudienceRestriction>
			`,
		)
		.join("");
}

function buildSAMLResponse({
	audienceGroups = [[serviceProviderEntityId]],
	destination = serviceProviderAcsUrl,
	recipient = serviceProviderAcsUrl,
}: {
	audienceGroups?: string[][];
	destination?: string | null;
	recipient?: string | null;
} = {}): string {
	const destinationAttribute = destination
		? ` Destination="${destination}"`
		: "";
	const recipientAttribute = recipient ? ` Recipient="${recipient}"` : "";

	return `
		<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"${destinationAttribute}>
			<saml:Assertion>
				<saml:Subject>
					<saml:NameID>user@example.com</saml:NameID>
					<saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
						<saml:SubjectConfirmationData${recipientAttribute} NotOnOrAfter="2030-01-01T00:00:00.000Z" />
					</saml:SubjectConfirmation>
				</saml:Subject>
				<saml:Conditions>
					${buildAudienceRestrictions(audienceGroups)}
				</saml:Conditions>
			</saml:Assertion>
		</samlp:Response>
	`;
}

function validate(xml: string, expectedAudiences = [serviceProviderEntityId]) {
	return validateSAMLResponseBinding(xml, {
		expectedAudiences,
		expectedRecipients: [serviceProviderAcsUrl],
	});
}

describe("validateSAMLResponseBinding", () => {
	it("accepts an assertion addressed to this Service Provider", () => {
		expect(() => validate(buildSAMLResponse())).not.toThrow();
	});

	it("accepts an explicitly configured audience alias", () => {
		const audienceAlias = "https://app.example.com/saml";

		expect(() =>
			validate(buildSAMLResponse({ audienceGroups: [[audienceAlias]] }), [
				serviceProviderEntityId,
				audienceAlias,
			]),
		).not.toThrow();
	});

	it("accepts multiple audiences in one AudienceRestriction when one matches", () => {
		expect(() =>
			validate(
				buildSAMLResponse({
					audienceGroups: [[otherServiceProvider, serviceProviderEntityId]],
				}),
			),
		).not.toThrow();
	});

	it("rejects an assertion with no AudienceRestriction", () => {
		expect(() => validate(buildSAMLResponse({ audienceGroups: [] }))).toThrow(
			/missing an AudienceRestriction/,
		);
	});

	it("rejects an assertion whose AudienceRestriction does not include this Service Provider", () => {
		expect(() =>
			validate(buildSAMLResponse({ audienceGroups: [[otherServiceProvider]] })),
		).toThrow(/audience does not match/);
	});

	it("rejects multiple AudienceRestriction conditions unless every condition matches", () => {
		expect(() =>
			validate(
				buildSAMLResponse({
					audienceGroups: [[serviceProviderEntityId], [otherServiceProvider]],
				}),
			),
		).toThrow(/audience does not match/);
	});

	it("rejects a bearer confirmation without Recipient", () => {
		expect(() => validate(buildSAMLResponse({ recipient: null }))).toThrow(
			/missing a Recipient/,
		);
	});

	it("rejects a bearer Recipient for another Service Provider", () => {
		expect(() =>
			validate(
				buildSAMLResponse({ recipient: "https://other.example.com/sso/acs" }),
			),
		).toThrow(/Recipient does not match/);
	});

	it("rejects a response Destination for another Service Provider", () => {
		expect(() =>
			validate(
				buildSAMLResponse({
					destination: "https://other.example.com/sso/acs",
				}),
			),
		).toThrow(/Destination does not match/);
	});

	it("accepts a response without Destination", () => {
		expect(() =>
			validate(buildSAMLResponse({ destination: null })),
		).not.toThrow();
	});
});

describe("getSAMLPostAssertionConsumerServiceUrls", () => {
	it("extracts only POST AssertionConsumerService locations from SP metadata", () => {
		const metadata = `
			<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/metadata">
				<md:SPSSODescriptor WantAssertionsSigned="false">
					<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
					<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://sp.example.com/saml/redirect" />
					<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
				</md:SPSSODescriptor>
			</md:EntityDescriptor>
		`;

		expect(getSAMLPostAssertionConsumerServiceUrls(metadata)).toEqual([
			"https://sp.example.com/saml/post",
		]);
	});

	it("returns no locations for empty or invalid metadata", () => {
		expect(getSAMLPostAssertionConsumerServiceUrls(undefined)).toEqual([]);
		expect(getSAMLPostAssertionConsumerServiceUrls("<")).toEqual([]);
	});

	it("rejects a mixed foreign-namespace POST endpoint decoy", () => {
		const metadata = `
			<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:foreign="urn:example:foreign" entityID="https://sp.example.com/metadata">
				<md:SPSSODescriptor WantAssertionsSigned="false">
					<foreign:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://attacker.example.com/saml/post" />
					<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
				</md:SPSSODescriptor>
			</md:EntityDescriptor>
		`;

		expect(() => parseSAMLServiceProviderMetadata(metadata)).toThrow();
		expect(getSAMLPostAssertionConsumerServiceUrls(metadata)).toEqual([]);
	});
});

describe("parseSAMLServiceProviderMetadata", () => {
	it.each([
		["true", true],
		["1", true],
		["false", false],
		["0", false],
	] as const)("parses XML Schema boolean %s", (value, expected) => {
		const metadata = `
			<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/metadata">
				<md:SPSSODescriptor WantAssertionsSigned="${value}">
					<md:NameIDFormat>urn:example:name-id</md:NameIDFormat>
					<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
				</md:SPSSODescriptor>
			</md:EntityDescriptor>
		`;

		expect(parseSAMLServiceProviderMetadata(metadata)).toEqual({
			entityID: "https://sp.example.com/metadata",
			nameIDFormats: ["urn:example:name-id"],
			postAssertionConsumerServiceUrls: ["https://sp.example.com/saml/post"],
			wantAssertionsSigned: expected,
		});
	});

	it.each([
		[
			"an invalid boolean",
			`
				<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/metadata">
					<md:SPSSODescriptor WantAssertionsSigned="TRUE">
						<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
					</md:SPSSODescriptor>
				</md:EntityDescriptor>
			`,
		],
		[
			"an unqualified tree",
			`
				<EntityDescriptor entityID="https://sp.example.com/metadata">
					<SPSSODescriptor WantAssertionsSigned="true">
						<AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
					</SPSSODescriptor>
				</EntityDescriptor>
			`,
		],
		[
			"a foreign root around a metadata decoy",
			`
				<foreign:EntityDescriptor xmlns:foreign="urn:example:foreign" xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/metadata">
					<md:EntityDescriptor entityID="https://sp.example.com/metadata">
						<md:SPSSODescriptor WantAssertionsSigned="true">
							<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
						</md:SPSSODescriptor>
					</md:EntityDescriptor>
				</foreign:EntityDescriptor>
			`,
		],
		[
			"a foreign service-provider descriptor",
			`
				<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:foreign="urn:example:foreign" entityID="https://sp.example.com/metadata">
					<foreign:SPSSODescriptor WantAssertionsSigned="true">
						<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
					</foreign:SPSSODescriptor>
				</md:EntityDescriptor>
			`,
		],
		[
			"a valid descriptor mixed with a later foreign descriptor",
			`
				<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:foreign="urn:example:foreign" entityID="https://sp.example.com/metadata">
					<md:SPSSODescriptor WantAssertionsSigned="false">
						<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
					</md:SPSSODescriptor>
					<foreign:SPSSODescriptor WantAssertionsSigned="false">
						<foreign:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://attacker.example.com/saml/post" />
					</foreign:SPSSODescriptor>
				</md:EntityDescriptor>
			`,
		],
		[
			"a foreign NameIDFormat before a valid NameIDFormat",
			`
				<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:foreign="urn:example:foreign" entityID="https://sp.example.com/metadata">
					<md:SPSSODescriptor WantAssertionsSigned="false">
						<foreign:NameIDFormat>urn:example:attacker</foreign:NameIDFormat>
						<md:NameIDFormat>urn:example:valid</md:NameIDFormat>
						<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post" />
					</md:SPSSODescriptor>
				</md:EntityDescriptor>
			`,
		],
		[
			"no SPSSODescriptor",
			`
				<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/metadata" />
			`,
		],
		[
			"a POST AssertionConsumerService Location containing a fragment",
			`
				<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/metadata">
					<md:SPSSODescriptor WantAssertionsSigned="false">
						<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post#fragment" />
					</md:SPSSODescriptor>
				</md:EntityDescriptor>
			`,
		],
		[
			"a POST AssertionConsumerService Location ending in a lone fragment marker",
			`
				<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/metadata">
					<md:SPSSODescriptor WantAssertionsSigned="false">
						<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/post#" />
					</md:SPSSODescriptor>
				</md:EntityDescriptor>
			`,
		],
	])("rejects metadata with %s", (_description, metadata) => {
		expect(() => parseSAMLServiceProviderMetadata(metadata)).toThrow();
	});

	it("accepts and aggregates multiple standard SPSSODescriptor elements", () => {
		const metadata = `
			<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://sp.example.com/metadata">
				<md:SPSSODescriptor WantAssertionsSigned="false">
					<md:NameIDFormat>urn:example:name-id:legacy</md:NameIDFormat>
					<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/legacy-acs" />
				</md:SPSSODescriptor>
				<md:SPSSODescriptor WantAssertionsSigned="true">
					<md:NameIDFormat>urn:example:name-id:current</md:NameIDFormat>
					<md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://sp.example.com/saml/current-acs" />
				</md:SPSSODescriptor>
			</md:EntityDescriptor>
		`;

		expect(parseSAMLServiceProviderMetadata(metadata)).toEqual({
			entityID: "https://sp.example.com/metadata",
			nameIDFormats: [
				"urn:example:name-id:legacy",
				"urn:example:name-id:current",
			],
			postAssertionConsumerServiceUrls: [
				"https://sp.example.com/saml/legacy-acs",
				"https://sp.example.com/saml/current-acs",
			],
			wantAssertionsSigned: true,
		});
	});
});

describe("hasSAMLEncryptedAssertion", () => {
	it("detects encrypted assertions without treating plain assertions as encrypted", () => {
		const encryptedResponse = `
			<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">
				<saml:EncryptedAssertion />
			</samlp:Response>
		`;

		expect(hasSAMLEncryptedAssertion(encryptedResponse)).toBe(true);
		expect(hasSAMLEncryptedAssertion(buildSAMLResponse())).toBe(false);
	});
});
