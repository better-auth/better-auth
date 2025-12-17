import { APIError } from "better-auth/api";
import { countAllNodes, xmlParser } from "./parser";

export interface AssertionCounts {
	assertions: number;
	encryptedAssertions: number;
	total: number;
}

/** @lintignore used in tests */
export function countAssertions(xml: string): AssertionCounts {
	let parsed: unknown;
	try {
		parsed = xmlParser.parse(xml);
	} catch {
		throw new APIError("BAD_REQUEST", {
			message: "Failed to parse SAML response XML",
			code: "SAML_INVALID_XML",
		});
	}

	const assertions = countAllNodes(parsed, "Assertion");
	const encryptedAssertions = countAllNodes(parsed, "EncryptedAssertion");

	return {
		assertions,
		encryptedAssertions,
		total: assertions + encryptedAssertions,
	};
}

export function validateSingleAssertion(samlResponse: string): void {
	let xml: string;
	try {
		xml = Buffer.from(samlResponse, "base64").toString("utf-8");
		if (!xml.includes("<")) {
			throw new Error("Not XML");
		}
	} catch {
		throw new APIError("BAD_REQUEST", {
			message: "Invalid base64-encoded SAML response",
			code: "SAML_INVALID_ENCODING",
		});
	}

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
