import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import type { JWK } from "jose";
import { compactVerify, decodeProtectedHeader, importJWK } from "jose";
import { createCertificate } from "./chrome";

/**
 * Raw DBSC server for probing what real Chromium does on the wire. It knows
 * nothing about Better Auth: each scenario decides how the registration and
 * refresh endpoints answer, and every request is logged for assertions.
 */

export const SESSION_COOKIE = "sid";
export const BOUND_COOKIE = "bound";
const BOUND_ATTRIBUTES = "Path=/; Secure; HttpOnly; SameSite=Lax";

export type ProofLog = {
	typ: unknown;
	alg: unknown;
	hasJwk: boolean;
	jti: unknown;
	verified: boolean;
};

export type RequestLog = {
	method: string;
	path: string;
	status: number;
	headers: Record<string, string | string[] | undefined>;
	proof: ProofLog | null;
};

type RefreshContext = {
	attempt: number;
	proof: ProofLog | null;
	issueChallenge: () => string;
};

type RefreshReply =
	| { kind: "challenge" }
	| { kind: "ok"; challenge?: boolean }
	| { kind: "status"; status: number };

export type Scenario = {
	/** Let requests from these hosts trigger a refresh, e.g. `["*"]` */
	allowedRefreshInitiators?: string[];
	/** Attach a refresh challenge to the registration 200 */
	challengeOnRegistration?: boolean;
	/** Decide each refresh answer. Default: 403 until a verified proof arrives */
	refresh?: (context: RefreshContext) => RefreshReply;
};

const defaultRefresh = ({ proof }: RefreshContext): RefreshReply =>
	proof?.verified ? { kind: "ok", challenge: true } : { kind: "challenge" };

function readStringHeader(value: string | string[] | undefined) {
	const raw = Array.isArray(value) ? value[0] : value;
	if (typeof raw !== "string" || !raw) return null;
	// The spec says sf-string; accept the bare form too and log which one came.
	return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
}

async function readProof(
	header: string | string[] | undefined,
	storedKey: JWK | null,
): Promise<ProofLog | null> {
	const jwt = readStringHeader(header);
	if (!jwt) return null;
	const protectedHeader = decodeProtectedHeader(jwt);
	const jwk = (protectedHeader.jwk as JWK | undefined) ?? storedKey;
	const key = jwk
		? await importJWK(jwk, protectedHeader.alg).catch(() => null)
		: null;
	const verified = key
		? await compactVerify(jwt, key).then(
				(result) => result,
				() => null,
			)
		: null;
	const payload = verified
		? JSON.parse(new TextDecoder().decode(verified.payload))
		: null;
	return {
		typ: protectedHeader.typ,
		alg: protectedHeader.alg,
		hasJwk: protectedHeader.jwk !== undefined,
		jti: payload?.jti,
		verified: verified !== null,
	};
}

export async function startProbeServer(scenario: Scenario = {}) {
	const { cert, key, spkiHash } = createCertificate();
	const log: RequestLog[] = [];
	const sessionId = `probe-${randomUUID()}`;
	const issued = new Set<string>();
	let publicKey: JWK | null = null;
	let refreshAttempt = 0;

	const issueChallenge = () => {
		const challenge = randomUUID();
		issued.add(challenge);
		return challenge;
	};
	const challengeHeader = (challenge: string) =>
		`"${challenge}";id="${sessionId}"`;
	const boundCookie = () =>
		`${BOUND_COOKIE}=${randomUUID()}; Max-Age=600; ${BOUND_ATTRIBUTES}`;
	const sessionConfig = () =>
		JSON.stringify({
			session_identifier: sessionId,
			refresh_url: "/dbsc/refresh",
			scope: { include_site: false },
			credentials: [
				{ type: "cookie", name: BOUND_COOKIE, attributes: BOUND_ATTRIBUTES },
			],
			...(scenario.allowedRefreshInitiators && {
				allowed_refresh_initiators: scenario.allowedRefreshInitiators,
			}),
		});

	const handle = async (request: IncomingMessage, response: ServerResponse) => {
		const url = new URL(request.url ?? "/", "https://localhost");
		const record = (proof: ProofLog | null) =>
			response.on("finish", () =>
				log.push({
					method: request.method ?? "",
					path: url.pathname,
					status: response.statusCode,
					headers: request.headers,
					proof,
				}),
			);
		response.setHeader("cache-control", "no-store");

		// Cross-site entry points: 127.0.0.1 and localhost are different sites,
		// which stands in for an OAuth or SAML callback arriving from an IdP.
		if (url.pathname === "/start") {
			record(null);
			response.setHeader("content-type", "text/html");
			response.end(
				`<!doctype html><script>location.href = ${JSON.stringify(url.searchParams.get("to"))}</script>`,
			);
			return;
		}
		if (url.pathname === "/bounce") {
			record(null);
			response.statusCode = 302;
			response.setHeader("location", url.searchParams.get("to") ?? "/");
			response.end();
			return;
		}

		if (url.pathname === "/login") {
			record(null);
			response.setHeader("set-cookie", [
				`${SESSION_COOKIE}=${randomUUID()}; Max-Age=86400; ${BOUND_ATTRIBUTES}`,
			]);
			response.setHeader(
				"secure-session-registration",
				`(ES256 RS256);path="/dbsc/register";challenge="${issueChallenge()}"`,
			);
			// An OAuth callback answers with a redirect, not a page.
			if (url.searchParams.has("redirect")) {
				response.statusCode = 302;
				response.setHeader("location", "/home");
				response.end();
				return;
			}
			response.setHeader("content-type", "text/html");
			response.end("<!doctype html><title>login</title><p>signed in</p>");
			return;
		}

		if (url.pathname === "/dbsc/register") {
			const proof = await readProof(
				request.headers["secure-session-response"],
				null,
			);
			record(proof);
			const header = decodeHeader(request.headers["secure-session-response"]);
			if (!proof?.verified || !header?.jwk) {
				response.statusCode = 400;
				response.end();
				return;
			}
			publicKey = header.jwk as JWK;
			response.setHeader("set-cookie", boundCookie());
			response.setHeader("content-type", "application/json");
			if (scenario.challengeOnRegistration) {
				response.setHeader(
					"secure-session-challenge",
					challengeHeader(issueChallenge()),
				);
			}
			response.end(sessionConfig());
			return;
		}

		if (url.pathname === "/dbsc/refresh") {
			refreshAttempt += 1;
			const proof = await readProof(
				request.headers["secure-session-response"],
				publicKey,
			);
			record(proof);
			const reply = (scenario.refresh ?? defaultRefresh)({
				attempt: refreshAttempt,
				proof,
				issueChallenge,
			});
			if (reply.kind === "challenge") {
				response.statusCode = 403;
				response.setHeader(
					"secure-session-challenge",
					challengeHeader(issueChallenge()),
				);
				response.end();
				return;
			}
			if (reply.kind === "status") {
				response.statusCode = reply.status;
				response.end();
				return;
			}
			response.setHeader("set-cookie", boundCookie());
			response.setHeader("content-type", "application/json");
			if (reply.challenge) {
				response.setHeader(
					"secure-session-challenge",
					challengeHeader(issueChallenge()),
				);
			}
			response.end(sessionConfig());
			return;
		}

		record(null);
		response.setHeader("content-type", "text/html");
		// A page that pulls several same-origin assets at once.
		if (url.pathname === "/gallery") {
			response.end(
				`<!doctype html><title>gallery</title>${Array.from({ length: 8 }, (_, i) => `<img src="/asset/${i}.png">`).join("")}`,
			);
			return;
		}
		response.end(`<!doctype html><title>${url.pathname}</title><p>ok</p>`);
	};

	const server = createServer({ cert, key }, (request, response) => {
		handle(request, response).catch((error: unknown) => {
			response.statusCode = 500;
			response.end(String(error));
		});
	});
	server.listen(0);
	await once(server, "listening");
	const { port } = server.address() as AddressInfo;

	return {
		origin: `https://localhost:${port}`,
		spkiHash,
		sessionId,
		log,
		issued,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

function decodeHeader(header: string | string[] | undefined) {
	const jwt = readStringHeader(header);
	return jwt ? decodeProtectedHeader(jwt) : null;
}
