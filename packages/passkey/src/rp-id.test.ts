import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import type { PasskeyOptions } from ".";
import { passkey } from ".";

/**
 * A software authenticator, so these tests exercise the real RP ID hash
 * check in `@simplewebauthn/server` instead of a mocked verifier.
 */
async function createAuthenticator() {
	const keyPair = await crypto.subtle.generateKey(
		{ name: "ECDSA", namedCurve: "P-256" },
		true,
		["sign", "verify"],
	);
	const jwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
	const credentialID = crypto.getRandomValues(new Uint8Array(16));
	const id = isoBase64URL.fromBuffer(credentialID);
	let counter = 0;

	const sha256 = async (data: Uint8Array<ArrayBuffer>) =>
		new Uint8Array(await crypto.subtle.digest("SHA-256", data));
	const concat = (...parts: Uint8Array[]) => {
		const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
		let offset = 0;
		for (const part of parts) {
			out.set(part, offset);
			offset += part.length;
		}
		return out;
	};
	const uint32 = (n: number) => {
		const out = new Uint8Array(4);
		new DataView(out.buffer).setUint32(0, n);
		return out;
	};
	const clientData = (type: string, challenge: string, origin: string) =>
		new TextEncoder().encode(
			JSON.stringify({ type, challenge, origin, crossOrigin: false }),
		);
	const derInteger = (bytes: Uint8Array) => {
		let start = 0;
		while (start < bytes.length - 1 && bytes[start] === 0) start++;
		let value = bytes.slice(start);
		if (value[0]! & 0x80) value = concat(new Uint8Array([0]), value);
		return concat(new Uint8Array([0x02, value.length]), value);
	};

	return {
		id,
		async register(args: { rpID: string; challenge: string; origin: string }) {
			const cosePublicKey = isoCBOR.encode(
				new Map<number, number | Uint8Array>([
					[1, 2],
					[3, -7],
					[-1, 1],
					[-2, isoBase64URL.toBuffer(jwk.x!)],
					[-3, isoBase64URL.toBuffer(jwk.y!)],
				]),
			);
			const authData = concat(
				await sha256(new TextEncoder().encode(args.rpID)),
				// UP | UV | AT
				new Uint8Array([0x45]),
				uint32(counter),
				new Uint8Array(16),
				new Uint8Array([0, credentialID.length]),
				credentialID,
				cosePublicKey,
			);
			const attestationObject = isoCBOR.encode(
				new Map<string, string | Uint8Array | Map<never, never>>([
					["fmt", "none"],
					["attStmt", new Map<never, never>()],
					["authData", authData],
				]),
			);
			return {
				id,
				rawId: id,
				type: "public-key" as const,
				response: {
					clientDataJSON: isoBase64URL.fromBuffer(
						clientData("webauthn.create", args.challenge, args.origin),
					),
					attestationObject: isoBase64URL.fromBuffer(attestationObject),
					transports: ["internal" as const],
				},
				clientExtensionResults: {},
			};
		},
		async authenticate(args: {
			rpID: string;
			challenge: string;
			origin: string;
		}) {
			counter++;
			const authData = concat(
				await sha256(new TextEncoder().encode(args.rpID)),
				// UP | UV
				new Uint8Array([0x05]),
				uint32(counter),
			);
			const clientDataJSON = clientData(
				"webauthn.get",
				args.challenge,
				args.origin,
			);
			const raw = new Uint8Array(
				await crypto.subtle.sign(
					{ name: "ECDSA", hash: "SHA-256" },
					keyPair.privateKey,
					concat(authData, await sha256(clientDataJSON)),
				),
			);
			const sequence = concat(
				derInteger(raw.slice(0, 32)),
				derInteger(raw.slice(32)),
			);
			const signature = concat(
				new Uint8Array([0x30, sequence.length]),
				sequence,
			);
			return {
				id,
				rawId: id,
				type: "public-key" as const,
				response: {
					clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
					authenticatorData: isoBase64URL.fromBuffer(authData),
					signature: isoBase64URL.fromBuffer(signature),
				},
				clientExtensionResults: {},
			};
		},
	};
}

const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const WEB_ORIGIN = "http://localhost:3000";

async function setup(options: PasskeyOptions) {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [passkey(options)],
	});
	const { headers: sessionHeaders } = await signInWithTestUser();
	const authenticator = await createAuthenticator();

	const withChallengeCookie = (headers: Headers, response: Headers) => {
		const cookie = response.get("set-cookie")?.split(";")[0];
		const next = new Headers(headers);
		next.set(
			"cookie",
			[headers.get("cookie"), cookie].filter(Boolean).join("; "),
		);
		return next;
	};

	return {
		async register(args: { origin: string; signedRPID?: string }) {
			const headers = new Headers(sessionHeaders);
			headers.set("origin", args.origin);
			const options = await auth.api.generatePasskeyRegistrationOptions({
				headers,
				returnHeaders: true,
			});
			const credential = await authenticator.register({
				rpID: args.signedRPID ?? options.response.rp.id!,
				challenge: options.response.challenge,
				origin: args.origin,
			});
			const result = await auth.api
				.verifyPasskeyRegistration({
					headers: withChallengeCookie(headers, options.headers),
					body: { response: credential },
				})
				.then(
					(passkey) => ({ ok: true as const, passkey }),
					(error: unknown) => ({ ok: false as const, error }),
				);
			return { optionsRPID: options.response.rp.id, result };
		},
		async authenticate(args: { origin: string; signedRPID?: string }) {
			const headers = new Headers({ origin: args.origin });
			const options = await auth.api.generatePasskeyAuthenticationOptions({
				headers,
				returnHeaders: true,
			});
			const assertion = await authenticator.authenticate({
				rpID: args.signedRPID ?? options.response.rpId!,
				challenge: options.response.challenge,
				origin: args.origin,
			});
			const result = await auth.api
				.verifyPasskeyAuthentication({
					headers: withChallengeCookie(headers, options.headers),
					body: { response: assertion },
				})
				.then(
					(session) => ({ ok: true as const, session }),
					(error: unknown) => ({ ok: false as const, error }),
				);
			return { optionsRPID: options.response.rpId, result };
		},
	};
}

describe("passkey rpID", () => {
	it("keeps the default rpID and rejects a response bound to another RP ID", async () => {
		const flow = await setup({});

		const rejected = await flow.register({
			origin: WEB_ORIGIN,
			signedRPID: "evil.example",
		});
		expect(rejected.optionsRPID).toBe("localhost");
		expect(rejected.result.ok).toBe(false);

		const registered = await flow.register({ origin: WEB_ORIGIN });
		expect(registered.result.ok).toBe(true);

		const authRejected = await flow.authenticate({
			origin: WEB_ORIGIN,
			signedRPID: "evil.example",
		});
		expect(authRejected.optionsRPID).toBe("localhost");
		expect(authRejected.result.ok).toBe(false);

		const authenticated = await flow.authenticate({ origin: WEB_ORIGIN });
		expect(authenticated.result.ok).toBe(true);
	});

	it("resolves rpID per request and verifies against expectedRPID", async () => {
		// A Chrome extension page must send the bare extension ID as `rp.id`,
		// while the authenticator signs the hash of the extension origin.
		const flow = await setup({
			rpID: ({ ctx }) => {
				const origin = ctx.headers?.get("origin");
				return origin === EXTENSION_ORIGIN ? EXTENSION_ID : "localhost";
			},
			expectedRPID: [EXTENSION_ORIGIN, "localhost"],
		});

		const extension = await flow.register({
			origin: EXTENSION_ORIGIN,
			signedRPID: EXTENSION_ORIGIN,
		});
		expect(extension.optionsRPID).toBe(EXTENSION_ID);
		expect(extension.result.ok).toBe(true);

		const web = await flow.authenticate({ origin: WEB_ORIGIN });
		expect(web.optionsRPID).toBe("localhost");
		expect(web.result.ok).toBe(true);

		const extensionAuth = await flow.authenticate({
			origin: EXTENSION_ORIGIN,
			signedRPID: EXTENSION_ORIGIN,
		});
		expect(extensionAuth.optionsRPID).toBe(EXTENSION_ID);
		expect(extensionAuth.result.ok).toBe(true);
	});

	it("rejects responses bound to an RP ID outside expectedRPID", async () => {
		const flow = await setup({
			rpID: EXTENSION_ID,
			expectedRPID: [EXTENSION_ORIGIN],
		});

		const bareID = await flow.register({ origin: EXTENSION_ORIGIN });
		expect(bareID.result.ok).toBe(false);

		const registered = await flow.register({
			origin: EXTENSION_ORIGIN,
			signedRPID: EXTENSION_ORIGIN,
		});
		expect(registered.result.ok).toBe(true);

		const authRejected = await flow.authenticate({
			origin: EXTENSION_ORIGIN,
			signedRPID: "localhost",
		});
		expect(authRejected.result.ok).toBe(false);
	});

	it("resolves expectedRPID per request", async () => {
		const flow = await setup({
			rpID: EXTENSION_ID,
			expectedRPID: ({ ctx }) => ctx.headers?.get("origin") ?? [],
		});

		const registered = await flow.register({
			origin: EXTENSION_ORIGIN,
			signedRPID: EXTENSION_ORIGIN,
		});
		expect(registered.result.ok).toBe(true);

		const authRejected = await flow.authenticate({
			origin: EXTENSION_ORIGIN,
			signedRPID: EXTENSION_ID,
		});
		expect(authRejected.result.ok).toBe(false);
	});

	it("rejects instead of skipping the RP ID check when expectedRPID is empty", async () => {
		const flow = await setup({ expectedRPID: () => "" });

		const registered = await flow.register({
			origin: WEB_ORIGIN,
			signedRPID: "evil.example",
		});
		expect(registered.result.ok).toBe(false);
	});

	it("rejects an rpID resolver that returns an empty value", async () => {
		const flow = await setup({ rpID: () => "" });

		await expect(flow.register({ origin: WEB_ORIGIN })).rejects.toThrow(
			"rpID resolved to an empty value",
		);
	});
});
