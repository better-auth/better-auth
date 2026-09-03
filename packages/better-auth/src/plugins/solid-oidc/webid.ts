/**
 * Solid terms vocabulary namespace.
 *
 * @see http://www.w3.org/ns/solid/terms
 */
export const SOLID_TERMS_NAMESPACE = "http://www.w3.org/ns/solid/terms#";

/**
 * The predicate a WebID profile document uses to name the OpenID Providers its
 * owner trusts to issue identity tokens for that WebID.
 *
 * @see https://solidproject.org/TR/oidc#webid-issuer
 */
export const SOLID_OIDC_ISSUER_PREDICATE = `${SOLID_TERMS_NAMESPACE}oidcIssuer`;

/**
 * Content types requested when dereferencing a WebID, most preferred first.
 *
 * JSON-LD is listed first deliberately: it is parsed structurally here, while
 * Turtle goes through the narrower scanner below. The Solid Protocol requires a
 * conformant server to serve both for an RDF resource, so any Solid Protocol
 * Server answers the JSON-LD request.
 *
 * @see https://solidproject.org/TR/protocol#resource-representations
 */
export const WEBID_ACCEPT_HEADER =
	"application/ld+json;q=1.0, text/turtle;q=0.9";

const JSON_LD_CONTENT_TYPES = ["application/ld+json", "application/json"];
const TURTLE_CONTENT_TYPES = ["text/turtle", "application/trig", "text/n3"];

/** Maximum WebID document size read before giving up, in bytes. */
const MAX_WEBID_DOCUMENT_BYTES = 1_000_000;

export interface WebIdIssuerResolution {
	/** Issuers named by the WebID document, in document order. */
	issuers: string[];
	/** The URL the document was actually read from, after redirects. */
	documentUrl: string;
	/** Serialization the document was parsed as. */
	format: "json-ld" | "turtle";
}

/**
 * Reads the `webid` claim from a verified ID token payload, falling back to
 * `sub` when the provider encodes the WebID there.
 *
 * Solid-OIDC permits either location, but only accepts an absolute `http(s)`
 * URI: an opaque `sub` is a provider-local identifier, not a WebID, and must
 * not be promoted to one.
 *
 * @see https://solidproject.org/TR/oidc#tokens-id
 */
export function extractWebId(
	claims: Record<string, unknown>,
): string | undefined {
	const candidates = [claims.webid, claims.webId, claims.sub];
	for (const candidate of candidates) {
		if (typeof candidate !== "string" || candidate.length === 0) continue;
		if (isHttpUri(candidate)) return candidate;
	}
	return undefined;
}

function isHttpUri(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

/**
 * Canonical form used to compare an issuer identifier written in a WebID
 * document against the issuer Better Auth discovered.
 *
 * OpenID Connect Discovery compares issuer identifiers exactly, but profile
 * documents are hand-written often enough that `https://op.example` and
 * `https://op.example/` both appear for the same provider. Only the empty path
 * segment is normalized away; any other path difference stays significant.
 */
export function canonicalizeIssuer(issuer: string): string | undefined {
	let url: URL;
	try {
		url = new URL(issuer);
	} catch {
		return undefined;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
	const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
	return `${url.protocol}//${url.host}${path}`;
}

/** Whether two absolute URLs share scheme, host, and port. */
export function haveSameAuthority(a: string, b: string): boolean {
	try {
		const left = new URL(a);
		const right = new URL(b);
		return left.protocol === right.protocol && left.host === right.host;
	} catch {
		return false;
	}
}

/** The document part of a WebID: the URI with its fragment removed. */
export function webIdDocumentUrl(webId: string): string {
	const url = new URL(webId);
	url.hash = "";
	return url.toString();
}

function resolveIri(iri: string, base: string): string | undefined {
	try {
		return new URL(iri, base).toString();
	} catch {
		return undefined;
	}
}

function matchesWebId(
	iri: string | undefined,
	webId: string,
	base: string,
): boolean {
	if (!iri) return false;
	const resolved = resolveIri(iri, base);
	if (!resolved) return false;
	return resolved === resolveIri(webId, base);
}

//#region JSON-LD

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Term names that may stand in for {@link SOLID_OIDC_ISSUER_PREDICATE} once the
 * document's own `@context` has been shown to map them there.
 */
function collectContextAliases(document: unknown): Set<string> {
	const aliases = new Set<string>();
	if (!isPlainObject(document)) return aliases;
	const contexts = Array.isArray(document["@context"])
		? document["@context"]
		: [document["@context"]];
	for (const context of contexts) {
		if (!isPlainObject(context)) continue;
		for (const [term, definition] of Object.entries(context)) {
			const target = isPlainObject(definition) ? definition["@id"] : definition;
			if (typeof target !== "string") continue;
			if (target === SOLID_OIDC_ISSUER_PREDICATE) {
				// e.g. { "oidcIssuer": "http://www.w3.org/ns/solid/terms#oidcIssuer" }
				aliases.add(term);
			} else if (target === SOLID_TERMS_NAMESPACE) {
				// e.g. { "solid": "http://www.w3.org/ns/solid/terms#" }
				aliases.add(`${term}:oidcIssuer`);
			}
		}
	}
	return aliases;
}

function isOidcIssuerKey(key: string, aliases: Set<string>): boolean {
	return key === SOLID_OIDC_ISSUER_PREDICATE || aliases.has(key);
}

function collectIssuerValues(value: unknown, into: string[]) {
	if (typeof value === "string") {
		into.push(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const entry of value) collectIssuerValues(entry, into);
		return;
	}
	if (!isPlainObject(value)) return;
	// A node reference (`{"@id": …}`) is the correct shape; `@value` covers
	// documents that write the issuer as a plain literal instead.
	for (const key of ["@id", "@value"]) {
		const nested = value[key];
		if (typeof nested === "string") into.push(nested);
	}
}

/**
 * Extracts `solid:oidcIssuer` values for `webId` from a parsed JSON-LD profile
 * document.
 *
 * Only nodes whose `@id` is the WebID itself contribute: a profile document may
 * describe several subjects, and an issuer another subject trusts says nothing
 * about this one.
 */
export function parseJsonLdOidcIssuers(
	document: unknown,
	webId: string,
	base: string,
): string[] {
	const aliases = collectContextAliases(document);
	const issuers: string[] = [];
	const seen = new Set<object>();

	const visit = (node: unknown) => {
		if (Array.isArray(node)) {
			for (const entry of node) visit(entry);
			return;
		}
		if (!isPlainObject(node)) return;
		if (seen.has(node)) return;
		seen.add(node);

		const id = node["@id"];
		if (typeof id === "string" && matchesWebId(id, webId, base)) {
			for (const [key, value] of Object.entries(node)) {
				if (isOidcIssuerKey(key, aliases)) {
					collectIssuerValues(value, issuers);
				}
			}
		}
		for (const value of Object.values(node)) visit(value);
	};

	visit(document);
	return issuers
		.map((issuer) => resolveIri(issuer, base))
		.filter((issuer): issuer is string => issuer !== undefined);
}

//#endregion

//#region Turtle

type TurtleToken =
	| { type: "iri"; value: string }
	| { type: "pname"; value: string }
	| { type: "punct"; value: ";" | "," | "." | "[" | "]" | "(" | ")" }
	| { type: "directive"; value: string }
	| { type: "literal" }
	| { type: "other"; value: string };

const TURTLE_QUOTES = ['"""', "'''", '"', "'"];

const TURTLE_DIRECTIVES = new Set(["@prefix", "@base", "prefix", "base"]);

/**
 * Tokenizes the subset of Turtle that appears in WebID profile documents:
 * prefix and base directives, IRIs, prefixed names, literals, collections, and
 * statement punctuation.
 *
 * Literals are tokenized but their contents are discarded — nothing here needs
 * a literal's value, and skipping them is what keeps a `;` or `.` inside a
 * string from being read as punctuation.
 */
export function tokenizeTurtle(input: string): TurtleToken[] {
	const tokens: TurtleToken[] = [];
	let index = 0;

	const startsWith = (text: string) => input.startsWith(text, index);

	while (index < input.length) {
		const char = input[index]!;

		if (/\s/.test(char)) {
			index++;
			continue;
		}
		if (char === "#") {
			while (index < input.length && input[index] !== "\n") index++;
			continue;
		}
		if (char === "<") {
			const end = input.indexOf(">", index + 1);
			if (end === -1) break;
			tokens.push({ type: "iri", value: input.slice(index + 1, end) });
			index = end + 1;
			continue;
		}
		const quote = TURTLE_QUOTES.find((candidate) => startsWith(candidate));
		if (quote) {
			index += quote.length;
			while (index < input.length) {
				if (input[index] === "\\") {
					index += 2;
					continue;
				}
				if (input.startsWith(quote, index)) {
					index += quote.length;
					break;
				}
				index++;
			}
			tokens.push({ type: "literal" });
			continue;
		}
		if (char === "@" || /^(?:prefix|base)\b/i.test(input.slice(index))) {
			const match = /^@?[A-Za-z][A-Za-z0-9-]*/.exec(input.slice(index));
			const value = match?.[0] ?? char;
			const normalized = value.toLowerCase();
			// A leading `@` also introduces a language tag (`"Alice"@en`). Only the
			// two real directives are tagged as such, so a language tag cannot be
			// mistaken for one and swallow the rest of the statement.
			tokens.push(
				TURTLE_DIRECTIVES.has(normalized)
					? { type: "directive", value: normalized }
					: { type: "other", value },
			);
			index += value.length;
			continue;
		}
		if (char === ";" || char === "," || char === "[" || char === "]") {
			tokens.push({ type: "punct", value: char });
			index++;
			continue;
		}
		if (char === "(" || char === ")") {
			tokens.push({ type: "punct", value: char });
			index++;
			continue;
		}
		if (char === ".") {
			// A `.` only terminates a statement when it is not part of a number.
			if (/[0-9]/.test(input[index + 1] ?? "")) {
				const match = /^\.[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(input.slice(index));
				index += match?.[0].length ?? 1;
				tokens.push({ type: "literal" });
				continue;
			}
			tokens.push({ type: "punct", value: "." });
			index++;
			continue;
		}
		const term = /^[^\s;,.()[\]<>"'#]+/.exec(input.slice(index));
		if (!term) {
			index++;
			continue;
		}
		const value = term[0]!;
		tokens.push(
			value.includes(":") ? { type: "pname", value } : { type: "other", value },
		);
		index += value.length;
	}

	return tokens;
}

interface TurtleNamespaces {
	prefixes: Map<string, string>;
	base: string;
}

function resolvePrefixedName(
	value: string,
	{ prefixes, base }: TurtleNamespaces,
): string | undefined {
	const separator = value.indexOf(":");
	if (separator === -1) return undefined;
	const prefix = value.slice(0, separator);
	const local = value.slice(separator + 1);
	const namespace = prefixes.get(prefix);
	if (namespace === undefined) return undefined;
	return resolveIri(`${namespace}${local}`, base);
}

function resolveTerm(
	token: TurtleToken,
	namespaces: TurtleNamespaces,
): string | undefined {
	if (token.type === "iri") return resolveIri(token.value, namespaces.base);
	if (token.type === "pname")
		return resolvePrefixedName(token.value, namespaces);
	return undefined;
}

/**
 * Extracts `solid:oidcIssuer` values for `webId` from a Turtle profile
 * document.
 *
 * Subject-scoped like the JSON-LD path: statements about any other subject are
 * skipped, so an issuer some other subject in the document trusts is never
 * mistaken for one this WebID trusts. Blank-node and collection contents are
 * skipped rather than guessed at, which is why an unparseable document yields
 * an empty list and the caller fails the confirmation closed.
 */
export function parseTurtleOidcIssuers(
	input: string,
	webId: string,
	base: string,
): string[] {
	const tokens = tokenizeTurtle(input);
	const namespaces: TurtleNamespaces = { prefixes: new Map(), base };
	const issuers: string[] = [];

	let cursor = 0;
	while (cursor < tokens.length) {
		const token = tokens[cursor]!;

		if (token.type === "directive") {
			const isPrefix = token.value === "@prefix" || token.value === "prefix";
			// Turtle spells the directives `@prefix`/`@base` and terminates them
			// with `.`; SPARQL spells them `PREFIX`/`BASE` with no terminator, so
			// only the Turtle form may consume up to the next `.`.
			const isTurtleForm = token.value.startsWith("@");
			if (isPrefix) {
				const name = tokens[cursor + 1];
				const iri = tokens[cursor + 2];
				if (name?.type === "pname" && iri?.type === "iri") {
					const resolved = resolveIri(iri.value, namespaces.base);
					if (resolved) {
						namespaces.prefixes.set(name.value.slice(0, -1), resolved);
					}
				}
				cursor = isTurtleForm ? skipToStatementEnd(tokens, cursor) : cursor + 3;
				continue;
			}
			const iri = tokens[cursor + 1];
			if (iri?.type === "iri") {
				const resolved = resolveIri(iri.value, namespaces.base);
				if (resolved) namespaces.base = resolved;
			}
			cursor = isTurtleForm ? skipToStatementEnd(tokens, cursor) : cursor + 2;
			continue;
		}

		if (token.type === "punct") {
			cursor++;
			continue;
		}

		const statementEnd = skipToStatementEnd(tokens, cursor);
		const subject = resolveTerm(token, namespaces);
		if (subject && matchesWebId(subject, webId, namespaces.base)) {
			collectTurtleIssuers(
				tokens.slice(cursor + 1, statementEnd),
				namespaces,
				issuers,
			);
		}
		cursor = statementEnd;
	}

	return issuers;
}

/**
 * Index just past the `.` that ends the statement starting at `start`,
 * ignoring `.` tokens nested inside blank-node or collection brackets.
 */
function skipToStatementEnd(tokens: TurtleToken[], start: number): number {
	let depth = 0;
	for (let cursor = start; cursor < tokens.length; cursor++) {
		const token = tokens[cursor]!;
		if (token.type !== "punct") continue;
		if (token.value === "[" || token.value === "(") depth++;
		else if (token.value === "]" || token.value === ")") depth--;
		else if (token.value === "." && depth <= 0) return cursor + 1;
	}
	return tokens.length;
}

function collectTurtleIssuers(
	tokens: TurtleToken[],
	namespaces: TurtleNamespaces,
	into: string[],
) {
	let onIssuerPredicate = false;
	let expectingPredicate = true;
	let depth = 0;

	for (const token of tokens) {
		if (token.type === "punct") {
			if (token.value === "[" || token.value === "(") depth++;
			else if (token.value === "]" || token.value === ")") depth--;
			else if (token.value === ";") {
				onIssuerPredicate = false;
				expectingPredicate = true;
			}
			continue;
		}
		// Nested blank nodes and collections describe a different subject.
		if (depth > 0) continue;
		if (expectingPredicate) {
			onIssuerPredicate =
				resolveTerm(token, namespaces) === SOLID_OIDC_ISSUER_PREDICATE;
			expectingPredicate = false;
			continue;
		}
		if (!onIssuerPredicate) continue;
		const object = resolveTerm(token, namespaces);
		if (object) into.push(object);
	}
}

//#endregion

/**
 * The fetch surface a WebID lookup needs. Narrower than `typeof fetch` so a
 * caller can pass a plain function, without the extra members the global
 * carries.
 */
export type WebIdFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface FetchWebIdOidcIssuersOptions {
	webId: string;
	/** Injected in tests; defaults to the global `fetch`. */
	fetchImpl?: WebIdFetch | undefined;
}

function pickFormat(contentType: string): "json-ld" | "turtle" | undefined {
	const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
	if (JSON_LD_CONTENT_TYPES.includes(mediaType)) return "json-ld";
	if (TURTLE_CONTENT_TYPES.includes(mediaType)) return "turtle";
	return undefined;
}

/**
 * Dereferences a WebID and returns the OpenID Providers its profile document
 * names.
 *
 * The document is fetched with `redirect: "follow"`: a WebID is a public,
 * user-published URI and profile documents are routinely served through
 * redirects. Callers must only pass a WebID taken from an ID token that has
 * already been cryptographically verified — never one supplied directly by a
 * request — because this issues a server-side fetch to that URI.
 */
export async function fetchWebIdOidcIssuers({
	webId,
	fetchImpl = fetch,
}: FetchWebIdOidcIssuersOptions): Promise<WebIdIssuerResolution> {
	const documentUrl = webIdDocumentUrl(webId);
	const response = await fetchImpl(documentUrl, {
		method: "GET",
		headers: { accept: WEBID_ACCEPT_HEADER },
	});
	if (!response.ok) {
		throw new Error(
			`WebID document "${documentUrl}" responded with ${response.status}`,
		);
	}
	const resolvedUrl = response.url || documentUrl;
	const contentType = response.headers.get("content-type") ?? "";
	const format = pickFormat(contentType);
	if (!format) {
		throw new Error(
			`WebID document "${documentUrl}" returned unsupported content type "${contentType || "unknown"}"`,
		);
	}
	const body = await response.text();
	if (body.length > MAX_WEBID_DOCUMENT_BYTES) {
		throw new Error(`WebID document "${documentUrl}" is too large to parse`);
	}

	if (format === "turtle") {
		return {
			issuers: parseTurtleOidcIssuers(body, webId, resolvedUrl),
			documentUrl: resolvedUrl,
			format,
		};
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new Error(`WebID document "${documentUrl}" is not valid JSON-LD`);
	}
	return {
		issuers: parseJsonLdOidcIssuers(parsed, webId, resolvedUrl),
		documentUrl: resolvedUrl,
		format,
	};
}
