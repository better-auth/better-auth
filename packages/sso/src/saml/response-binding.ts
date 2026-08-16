import { APIError } from "better-auth/api";
import { countAllNodes, findNode, xmlParser } from "./parser";

export const SAML_HTTP_POST_BINDING =
	"urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

const SAML_BEARER_CONFIRMATION_METHOD = "urn:oasis:names:tc:SAML:2.0:cm:bearer";

type XmlNode = Record<string, unknown>;

export interface SAMLResponseBindingValidationOptions {
	expectedAudiences: Array<string | undefined>;
	expectedRecipients: Array<string | undefined>;
}

function toNode(value: unknown): XmlNode | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as XmlNode;
}

function toNodeArray(value: unknown): XmlNode[] {
	if (Array.isArray(value)) {
		return value.map(toNode).filter((node): node is XmlNode => !!node);
	}
	const node = toNode(value);
	return node ? [node] : [];
}

function firstNode(value: unknown): XmlNode | null {
	return toNodeArray(value)[0] ?? null;
}

function toStringArray(value: unknown): string[] {
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value)) {
		return value.flatMap(toStringArray);
	}
	const node = toNode(value);
	const text = node?.["#text"];
	return typeof text === "string" ? [text] : [];
}

function toStringSet(values: Array<string | undefined>): Set<string> {
	return new Set(values.filter((value): value is string => !!value));
}

function parseSAMLContent(samlContent: string): XmlNode {
	try {
		const parsed = toNode(xmlParser.parse(samlContent));
		if (parsed) {
			return parsed;
		}
	} catch {
		// Fall through to the APIError below so callers receive a stable code.
	}
	throw new APIError("BAD_REQUEST", {
		message: "SAML response XML could not be parsed",
		code: "SAML_RESPONSE_INVALID_XML",
	});
}

export function getSAMLPostAssertionConsumerServiceUrls(
	metadata: string | undefined,
): string[] {
	if (!metadata) {
		return [];
	}

	try {
		const parsed = toNode(xmlParser.parse(metadata));
		const spDescriptors = toNodeArray(findNode(parsed, "SPSSODescriptor"));
		const locations = spDescriptors.flatMap((descriptor) =>
			toNodeArray(descriptor.AssertionConsumerService)
				.filter((service) => service["@_Binding"] === SAML_HTTP_POST_BINDING)
				.map((service) => service["@_Location"])
				.filter(
					(location): location is string =>
						typeof location === "string" && !!location,
				),
		);
		return [...new Set(locations)];
	} catch {
		return [];
	}
}

export function hasSAMLEncryptedAssertion(samlContent: string): boolean {
	try {
		const parsed = xmlParser.parse(samlContent);
		return countAllNodes(parsed, "EncryptedAssertion") > 0;
	} catch {
		return false;
	}
}

function getResponseNode(parsed: XmlNode): XmlNode | null {
	return firstNode(parsed.Response);
}

function getAssertionNode(parsed: XmlNode, response: XmlNode | null): XmlNode {
	const assertion =
		firstNode(response?.Assertion) ?? firstNode(parsed.Assertion);
	if (assertion) {
		return assertion;
	}
	throw new APIError("BAD_REQUEST", {
		message: "SAML response is missing an assertion",
		code: "SAML_ASSERTION_MISSING",
	});
}

function getAudienceRestrictionGroups(assertion: XmlNode): string[][] {
	const conditions = firstNode(assertion.Conditions);
	const restrictions = toNodeArray(conditions?.AudienceRestriction);
	return restrictions.map((restriction) =>
		toStringArray(restriction.Audience).filter(Boolean),
	);
}

function validateAudienceRestrictions(
	assertion: XmlNode,
	expectedAudiences: Set<string>,
): void {
	const audienceGroups = getAudienceRestrictionGroups(assertion);

	if (
		audienceGroups.length === 0 ||
		audienceGroups.every((group) => !group.length)
	) {
		throw new APIError("BAD_REQUEST", {
			message: "SAML assertion is missing an AudienceRestriction",
			code: "SAML_AUDIENCE_MISSING",
		});
	}

	const hasRejectedAudienceRestriction = audienceGroups.some(
		(group) => !group.some((audience) => expectedAudiences.has(audience)),
	);

	if (hasRejectedAudienceRestriction) {
		throw new APIError("BAD_REQUEST", {
			message: "SAML assertion audience does not match this Service Provider",
			code: "SAML_AUDIENCE_MISMATCH",
		});
	}
}

function getBearerSubjectConfirmationData(assertion: XmlNode): XmlNode[] {
	const subject = firstNode(assertion.Subject);
	const confirmations = toNodeArray(subject?.SubjectConfirmation);
	return confirmations
		.filter(
			(confirmation) =>
				confirmation["@_Method"] === SAML_BEARER_CONFIRMATION_METHOD,
		)
		.map((confirmation) => firstNode(confirmation.SubjectConfirmationData))
		.filter((data): data is XmlNode => !!data);
}

function validateBearerRecipient(
	assertion: XmlNode,
	expectedRecipients: Set<string>,
): void {
	const confirmationData = getBearerSubjectConfirmationData(assertion);

	if (!confirmationData.length) {
		throw new APIError("BAD_REQUEST", {
			message: "SAML assertion is missing bearer SubjectConfirmationData",
			code: "SAML_BEARER_CONFIRMATION_MISSING",
		});
	}

	const recipients = confirmationData
		.map((data) => data["@_Recipient"])
		.filter((recipient): recipient is string => typeof recipient === "string");

	if (!recipients.length) {
		throw new APIError("BAD_REQUEST", {
			message: "SAML bearer SubjectConfirmationData is missing a Recipient",
			code: "SAML_RECIPIENT_MISSING",
		});
	}

	if (!recipients.some((recipient) => expectedRecipients.has(recipient))) {
		throw new APIError("BAD_REQUEST", {
			message:
				"SAML bearer SubjectConfirmationData Recipient does not match this Service Provider",
			code: "SAML_RECIPIENT_MISMATCH",
		});
	}
}

function validateResponseDestination(
	response: XmlNode | null,
	expectedRecipients: Set<string>,
): void {
	const destination = response?.["@_Destination"];
	if (typeof destination !== "string" || !destination) {
		return;
	}

	if (!expectedRecipients.has(destination)) {
		throw new APIError("BAD_REQUEST", {
			message: "SAML response Destination does not match this Service Provider",
			code: "SAML_DESTINATION_MISMATCH",
		});
	}
}

export function validateSAMLResponseBinding(
	samlContent: string,
	options: SAMLResponseBindingValidationOptions,
): void {
	const expectedAudiences = toStringSet(options.expectedAudiences);
	const expectedRecipients = toStringSet(options.expectedRecipients);
	const parsed = parseSAMLContent(samlContent);
	const response = getResponseNode(parsed);
	const assertion = getAssertionNode(parsed, response);

	validateAudienceRestrictions(assertion, expectedAudiences);
	validateBearerRecipient(assertion, expectedRecipients);
	validateResponseDestination(response, expectedRecipients);
}
