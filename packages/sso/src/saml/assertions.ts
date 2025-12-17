import { APIError } from "better-auth/api";
import { countAllNodes, xmlParser } from "./parser";

export interface AssertionCounts {
	assertions: number;
	encryptedAssertions: number;
	total: number;
}

export function countAssertions(xml: string): AssertionCounts {
	const parsed = xmlParser.parse(xml);

	const assertions = countAllNodes(parsed, "Assertion");
	const encryptedAssertions = countAllNodes(parsed, "EncryptedAssertion");

	return {
		assertions,
		encryptedAssertions,
		total: assertions + encryptedAssertions,
	};
}

export function validateSingleAssertion(samlResponse: string): void {
	const xml = Buffer.from(samlResponse, "base64").toString("utf-8");
	const counts = countAssertions(xml);

	if (counts.total === 0) {
		throw new APIError("BAD_REQUEST", {
			message: "SAML response contains no assertions",
			code: "SAML_NO_ASSERTION",
		});
	}

	if (counts.total > 1) {
		throw new APIError("BAD_REQUEST", {
			message: `SAML response contains ${counts.total} assertions, expected exactly 1`,
			code: "SAML_MULTIPLE_ASSERTIONS",
		});
	}
}
