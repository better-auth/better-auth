import { describe, expect, it } from "vitest";
import {
	getSAMLPostAssertionConsumerServiceUrls,
	hasSAMLEncryptedAssertion,
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
			<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata">
				<md:SPSSODescriptor>
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
