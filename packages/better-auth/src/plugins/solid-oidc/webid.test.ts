import { describe, expect, it, vi } from "vitest";
import {
	canonicalizeIssuer,
	extractWebId,
	fetchWebIdOidcIssuers,
	haveSameAuthority,
	parseJsonLdOidcIssuers,
	parseTurtleOidcIssuers,
	SOLID_OIDC_ISSUER_PREDICATE,
	WEBID_ACCEPT_HEADER,
	webIdDocumentUrl,
} from "./webid";

const WEBID = "https://alice.example/profile/card#me";
const DOCUMENT_URL = "https://alice.example/profile/card";
const ISSUER = "https://op.example";

describe("extractWebId", () => {
	it("prefers the webid claim", () => {
		expect(
			extractWebId({ webid: WEBID, sub: "https://op.example/users/alice" }),
		).toBe(WEBID);
	});

	it("falls back to sub when it is an absolute http(s) URI", () => {
		expect(extractWebId({ sub: WEBID })).toBe(WEBID);
	});

	it("ignores an opaque sub, which is a provider-local identifier", () => {
		expect(extractWebId({ sub: "johndoe" })).toBeUndefined();
	});

	it("ignores a non-http URI scheme", () => {
		expect(extractWebId({ webid: "did:example:alice" })).toBeUndefined();
		expect(extractWebId({ webid: "file:///etc/passwd" })).toBeUndefined();
	});

	it("ignores empty and non-string claims", () => {
		expect(extractWebId({ webid: "", sub: 42 })).toBeUndefined();
		expect(extractWebId({})).toBeUndefined();
	});
});

describe("canonicalizeIssuer", () => {
	it("treats a bare origin and a trailing slash as the same issuer", () => {
		expect(canonicalizeIssuer("https://op.example")).toBe(
			canonicalizeIssuer("https://op.example/"),
		);
	});

	it("keeps a real path difference significant", () => {
		expect(canonicalizeIssuer("https://op.example/tenant-a")).not.toBe(
			canonicalizeIssuer("https://op.example/tenant-b"),
		);
	});

	it("normalizes only a single trailing slash on a path", () => {
		expect(canonicalizeIssuer("https://op.example/tenant/")).toBe(
			"https://op.example/tenant",
		);
	});

	it("rejects values that are not absolute http(s) URLs", () => {
		expect(canonicalizeIssuer("op.example")).toBeUndefined();
		expect(canonicalizeIssuer("ftp://op.example")).toBeUndefined();
		expect(canonicalizeIssuer("")).toBeUndefined();
	});
});

describe("haveSameAuthority", () => {
	it("matches scheme, host, and port", () => {
		expect(
			haveSameAuthority(
				"https://op.example/alice/card#me",
				"https://op.example",
			),
		).toBe(true);
	});

	it("does not match across ports", () => {
		expect(
			haveSameAuthority(
				"http://localhost:3000/card#me",
				"http://localhost:4000",
			),
		).toBe(false);
	});

	it("does not match across schemes", () => {
		expect(
			haveSameAuthority("http://op.example/card#me", "https://op.example"),
		).toBe(false);
	});

	it("does not match a subdomain against its parent", () => {
		expect(
			haveSameAuthority(
				"https://alice.op.example/card#me",
				"https://op.example",
			),
		).toBe(false);
	});
});

describe("webIdDocumentUrl", () => {
	it("drops the fragment", () => {
		expect(webIdDocumentUrl(WEBID)).toBe(DOCUMENT_URL);
	});

	it("leaves a fragmentless WebID alone", () => {
		expect(webIdDocumentUrl(DOCUMENT_URL)).toBe(DOCUMENT_URL);
	});
});

describe("parseJsonLdOidcIssuers", () => {
	it("reads expanded JSON-LD, the form a Solid server emits", () => {
		const document = [
			{
				"@id": WEBID,
				[SOLID_OIDC_ISSUER_PREDICATE]: [{ "@id": ISSUER }],
			},
		];
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("reads a node inside an @graph", () => {
		const document = {
			"@graph": [
				{ "@id": "https://alice.example/profile/card", "@type": "Document" },
				{
					"@id": WEBID,
					[SOLID_OIDC_ISSUER_PREDICATE]: { "@id": ISSUER },
				},
			],
		};
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("resolves a relative subject against the document URL", () => {
		const document = {
			"@id": "#me",
			[SOLID_OIDC_ISSUER_PREDICATE]: { "@id": ISSUER },
		};
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("reads a compacted term the document's own @context maps", () => {
		const document = {
			"@context": { solid: "http://www.w3.org/ns/solid/terms#" },
			"@id": WEBID,
			"solid:oidcIssuer": { "@id": ISSUER },
		};
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("reads a term aliased directly to the predicate IRI", () => {
		const document = {
			"@context": { oidcIssuer: SOLID_OIDC_ISSUER_PREDICATE },
			"@id": WEBID,
			oidcIssuer: ISSUER,
		};
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("collects several issuers", () => {
		const document = {
			"@id": WEBID,
			[SOLID_OIDC_ISSUER_PREDICATE]: [
				{ "@id": ISSUER },
				{ "@id": "https://other-op.example" },
			],
		};
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
			"https://other-op.example/",
		]);
	});

	/**
	 * A profile document may describe several subjects. An issuer another
	 * subject trusts says nothing about this WebID, so accepting it would let a
	 * co-tenant on the same document authorize a provider for someone else.
	 */
	it("ignores an issuer declared for a different subject", () => {
		const document = [
			{
				"@id": "https://alice.example/profile/card#bob",
				[SOLID_OIDC_ISSUER_PREDICATE]: [{ "@id": ISSUER }],
			},
		];
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([]);
	});

	/**
	 * A bare `oidcIssuer` key with nothing mapping it to the Solid vocabulary is
	 * not proof of anything: some other vocabulary could define that term. The
	 * parser fails closed and the caller rejects the sign-in.
	 */
	it("ignores an unmapped compact term", () => {
		const document = {
			"@id": WEBID,
			oidcIssuer: { "@id": ISSUER },
		};
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([]);
	});

	it("ignores a term mapped to some other vocabulary", () => {
		const document = {
			"@context": { oidcIssuer: "https://example.com/vocab#oidcIssuer" },
			"@id": WEBID,
			oidcIssuer: { "@id": ISSUER },
		};
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([]);
	});

	it("returns nothing for shapes it cannot read", () => {
		expect(parseJsonLdOidcIssuers(null, WEBID, DOCUMENT_URL)).toEqual([]);
		expect(
			parseJsonLdOidcIssuers("not a document", WEBID, DOCUMENT_URL),
		).toEqual([]);
		expect(parseJsonLdOidcIssuers({}, WEBID, DOCUMENT_URL)).toEqual([]);
	});

	it("does not loop on a self-referential document", () => {
		const document: Record<string, unknown> = {
			"@id": WEBID,
			[SOLID_OIDC_ISSUER_PREDICATE]: { "@id": ISSUER },
		};
		document.self = document;
		expect(parseJsonLdOidcIssuers(document, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});
});

describe("parseTurtleOidcIssuers", () => {
	it("reads a prefixed predicate on a relative subject", () => {
		const turtle = `
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			<#me> solid:oidcIssuer <${ISSUER}> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("reads the full predicate IRI", () => {
		const turtle = `<${WEBID}> <${SOLID_OIDC_ISSUER_PREDICATE}> <${ISSUER}> .`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("reads several issuers separated by a comma", () => {
		const turtle = `
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			<#me> solid:oidcIssuer <${ISSUER}>, <https://other-op.example> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
			"https://other-op.example/",
		]);
	});

	it("reads a predicate that follows other predicates in the same statement", () => {
		const turtle = `
			@prefix foaf: <http://xmlns.com/foaf/0.1/> .
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			<#me>
				a foaf:Person ;
				foaf:name "Alice Example" ;
				solid:oidcIssuer <${ISSUER}> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("honors SPARQL-style PREFIX and BASE directives", () => {
		const turtle = `
			BASE <https://alice.example/profile/card>
			PREFIX solid: <http://www.w3.org/ns/solid/terms#>
			<#me> solid:oidcIssuer <${ISSUER}> .
		`;
		expect(
			parseTurtleOidcIssuers(turtle, WEBID, "https://elsewhere.example/"),
		).toEqual([`${ISSUER}/`]);
	});

	it("ignores an issuer declared for a different subject", () => {
		const turtle = `
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			<#bob> solid:oidcIssuer <${ISSUER}> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([]);
	});

	it("ignores a predicate from a different vocabulary", () => {
		const turtle = `
			@prefix fake: <https://example.com/vocab#> .
			<#me> fake:oidcIssuer <${ISSUER}> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([]);
	});

	it("ignores a prefix that was never declared", () => {
		const turtle = `<#me> solid:oidcIssuer <${ISSUER}> .`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([]);
	});

	/**
	 * A `.` or `;` inside a literal must not end the statement, otherwise the
	 * scanner would resynchronize on the wrong subject and read the following
	 * terms as a new statement.
	 */
	it("does not mistake punctuation inside a literal for a statement break", () => {
		const turtle = `
			@prefix foaf: <http://xmlns.com/foaf/0.1/> .
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			<#me>
				foaf:name "Alice. Bob; Carol" ;
				solid:oidcIssuer <${ISSUER}> .
			<#bob> foaf:name "Bob" .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("handles long-quoted literals containing a period", () => {
		const turtle = `
			@prefix foaf: <http://xmlns.com/foaf/0.1/> .
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			<#me>
				foaf:name """Alice.
				Example.""" ;
				solid:oidcIssuer <${ISSUER}> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("does not let a language tag swallow the rest of the statement", () => {
		const turtle = `
			@prefix foaf: <http://xmlns.com/foaf/0.1/> .
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			<#me>
				foaf:name "Alice Example"@en ;
				solid:oidcIssuer <${ISSUER}> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("reads a typed literal without losing the following predicate", () => {
		const turtle = `
			@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
			@prefix ex: <https://example.com/vocab#> .
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			<#me>
				ex:seats "3"^^xsd:integer ;
				solid:oidcIssuer <${ISSUER}> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	it("ignores comments", () => {
		const turtle = `
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			# <#me> solid:oidcIssuer <https://attacker.example> .
			<#me> solid:oidcIssuer <${ISSUER}> .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([
			`${ISSUER}/`,
		]);
	});

	/**
	 * A blank node describes a subject of its own, so an issuer nested inside
	 * one is not an issuer this WebID named.
	 */
	it("ignores an issuer nested in a blank node", () => {
		const turtle = `
			@prefix solid: <http://www.w3.org/ns/solid/terms#> .
			@prefix ex: <https://example.com/vocab#> .
			<#me> ex:delegate [ solid:oidcIssuer <https://attacker.example> ] .
		`;
		expect(parseTurtleOidcIssuers(turtle, WEBID, DOCUMENT_URL)).toEqual([]);
	});

	it("returns nothing for an empty or unparseable document", () => {
		expect(parseTurtleOidcIssuers("", WEBID, DOCUMENT_URL)).toEqual([]);
		expect(parseTurtleOidcIssuers("<<<<", WEBID, DOCUMENT_URL)).toEqual([]);
	});
});

describe("fetchWebIdOidcIssuers", () => {
	const jsonLdResponse = (body: unknown) =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { "content-type": "application/ld+json" },
		});

	it("requests the WebID document without its fragment and negotiates JSON-LD", async () => {
		const fetchImpl = vi.fn(async () =>
			jsonLdResponse([
				{ "@id": WEBID, [SOLID_OIDC_ISSUER_PREDICATE]: [{ "@id": ISSUER }] },
			]),
		);

		const result = await fetchWebIdOidcIssuers({ webId: WEBID, fetchImpl });

		expect(fetchImpl).toHaveBeenCalledWith(DOCUMENT_URL, {
			method: "GET",
			headers: { accept: WEBID_ACCEPT_HEADER },
		});
		expect(result.format).toBe("json-ld");
		expect(result.issuers).toEqual([`${ISSUER}/`]);
	});

	it("parses a Turtle response", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response(
					`@prefix solid: <http://www.w3.org/ns/solid/terms#> .\n<#me> solid:oidcIssuer <${ISSUER}> .`,
					{ status: 200, headers: { "content-type": "text/turtle" } },
				),
		);

		const result = await fetchWebIdOidcIssuers({ webId: WEBID, fetchImpl });
		expect(result.format).toBe("turtle");
		expect(result.issuers).toEqual([`${ISSUER}/`]);
	});

	it("resolves relative terms against the URL the document came from", async () => {
		const fetchImpl = vi.fn(async () => {
			const response = new Response(
				`<#me> <${SOLID_OIDC_ISSUER_PREDICATE}> <${ISSUER}> .`,
				{ status: 200, headers: { "content-type": "text/turtle" } },
			);
			// A profile document is routinely served through a redirect.
			Object.defineProperty(response, "url", { value: DOCUMENT_URL });
			return response;
		});

		const result = await fetchWebIdOidcIssuers({ webId: WEBID, fetchImpl });
		expect(result.documentUrl).toBe(DOCUMENT_URL);
		expect(result.issuers).toEqual([`${ISSUER}/`]);
	});

	it("throws when the document cannot be retrieved", async () => {
		const fetchImpl = vi.fn(async () => new Response("", { status: 404 }));
		await expect(
			fetchWebIdOidcIssuers({ webId: WEBID, fetchImpl }),
		).rejects.toThrow(/responded with 404/);
	});

	it("throws on a content type it cannot parse, rather than guessing", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response("<html></html>", {
					status: 200,
					headers: { "content-type": "text/html" },
				}),
		);
		await expect(
			fetchWebIdOidcIssuers({ webId: WEBID, fetchImpl }),
		).rejects.toThrow(/unsupported content type/);
	});

	it("throws on a JSON-LD response that is not valid JSON", async () => {
		const fetchImpl = vi.fn(
			async () =>
				new Response("{not json", {
					status: 200,
					headers: { "content-type": "application/ld+json" },
				}),
		);
		await expect(
			fetchWebIdOidcIssuers({ webId: WEBID, fetchImpl }),
		).rejects.toThrow(/not valid JSON-LD/);
	});
});
