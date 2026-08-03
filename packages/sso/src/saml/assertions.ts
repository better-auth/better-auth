import { base64 } from "@better-auth/utils/base64";
import type { Element as XMLElement } from "@xmldom/xmldom";
import { DOMParser } from "@xmldom/xmldom";
import { APIError } from "better-auth/api";
import { saml } from "../samlify";
import { countAllNodes, xmlParser } from "./parser";

const SAML_ASSERTION_NAMESPACE = "urn:oasis:names:tc:SAML:2.0:assertion";
const SAML_PROTOCOL_NAMESPACE = "urn:oasis:names:tc:SAML:2.0:protocol";
const XML_SIGNATURE_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#";

export interface AssertionCounts {
	assertions: number;
	encryptedAssertions: number;
	total: number;
}

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
		xml = new TextDecoder().decode(
			base64.decode(samlResponse.replace(/\s+/g, "")),
		);
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

function assertionSignatureFailure(): APIError {
	return new APIError("BAD_REQUEST", {
		code: "SAML_ASSERTION_SIGNATURE_REQUIRED",
		message: "SAML assertion signature is required",
	});
}

/**
 * Verifies that the sole plaintext SAML Assertion, rather than only its
 * enclosing Response, is authenticated by an XML signature from the IdP.
 */
export function verifySAMLAssertionSignature(
	samlContent: string,
	verificationOptions: Parameters<typeof saml.SamlLib.verifySignature>[1],
): void {
	try {
		const document = new DOMParser({
			onError: (_level, message) => {
				throw new Error(message);
			},
		}).parseFromString(samlContent, "text/xml");
		const response = document.documentElement;
		if (
			!response ||
			response.localName !== "Response" ||
			response.namespaceURI !== SAML_PROTOCOL_NAMESPACE
		) {
			throw assertionSignatureFailure();
		}

		const assertionElements = Array.from(response.childNodes).filter(
			(node): node is XMLElement =>
				node.nodeType === 1 &&
				node.localName === "Assertion" &&
				node.namespaceURI === SAML_ASSERTION_NAMESPACE,
		);
		const assertion = assertionElements.at(0);
		if (assertionElements.length !== 1 || !assertion) {
			throw assertionSignatureFailure();
		}
		const assertionSignatures = Array.from(assertion.childNodes).filter(
			(node): node is XMLElement =>
				node.nodeType === 1 &&
				node.localName === "Signature" &&
				node.namespaceURI === XML_SIGNATURE_NAMESPACE,
		);
		if (assertionSignatures.length !== 1) {
			throw assertionSignatureFailure();
		}

		// samlify selects Signature candidates by local-name() only, so a
		// foreign-namespace decoy must be stripped too, not just the real one.
		for (const node of Array.from(response.childNodes)) {
			if (node.nodeType === 1 && node.localName === "Signature") {
				response.removeChild(node);
			}
		}

		const assertionId = assertion.getAttribute("ID");
		if (!assertionId) {
			throw assertionSignatureFailure();
		}
		const [verified, authenticatedAssertion] = saml.SamlLib.verifySignature(
			document.toString(),
			verificationOptions,
		);
		if (!verified || !authenticatedAssertion) {
			throw assertionSignatureFailure();
		}
		const authenticatedDocument = new DOMParser().parseFromString(
			authenticatedAssertion,
			"text/xml",
		);
		const authenticatedRoot = authenticatedDocument.documentElement;
		if (
			!authenticatedRoot ||
			authenticatedRoot.localName !== "Assertion" ||
			authenticatedRoot.namespaceURI !== SAML_ASSERTION_NAMESPACE ||
			authenticatedRoot.getAttribute("ID") !== assertionId
		) {
			throw assertionSignatureFailure();
		}
	} catch (error) {
		if (
			error instanceof APIError &&
			error.body?.code === "SAML_ASSERTION_SIGNATURE_REQUIRED"
		) {
			throw error;
		}
		throw assertionSignatureFailure();
	}
}
