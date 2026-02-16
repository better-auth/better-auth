import { SignJWT, exportJWK, generateKeyPair, importJWK, jwtVerify } from "jose";
import { generateId } from "@better-auth/core/utils/id";

/**
 * Generate an Ed25519 keypair and export as JWK.
 * Adds a unique `kid` to both keys.
 * The private key should never be sent to or stored on any server.
 */
export async function generateAgentKeypair() {
	const { publicKey, privateKey } = await generateKeyPair("EdDSA", {
		crv: "Ed25519",
		extractable: true,
	});

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);

	const kid = `agt_key_${generateId(16)}`;
	publicWebKey.kid = kid;
	privateWebKey.kid = kid;

	return { publicKey: publicWebKey, privateKey: privateWebKey, kid };
}

export interface SignAgentJWTOptions {
	agentId: string;
	privateKey: Record<string, unknown>;
	expiresIn?: number;
	format?: "simple" | "aap";
	additionalClaims?: Record<string, unknown>;
}

/**
 * Sign a short-lived JWT with the agent's Ed25519 private key.
 * Encapsulates the simple vs AAP claim format logic.
 */
export async function signAgentJWT(options: SignAgentJWTOptions) {
	const {
		agentId,
		privateKey,
		expiresIn = 60,
		format = "simple",
		additionalClaims,
	} = options;

	const key = await importJWK(privateKey, "EdDSA");
	const now = Math.floor(Date.now() / 1000);

	return await new SignJWT({
		...(format === "aap"
			? {
					aap_agent: {
						id: agentId,
						type: "autonomous",
						independent: true,
					},
					...additionalClaims,
				}
			: additionalClaims),
	})
		.setProtectedHeader({
			alg: "EdDSA",
			kid: privateKey.kid as string | undefined,
		})
		.setSubject(agentId)
		.setIssuedAt(now)
		.setExpirationTime(now + expiresIn)
		.setJti(generateId(24))
		.sign(key);
}

export interface VerifyAgentJWTOptions {
	jwt: string;
	publicKey: Record<string, unknown>;
	maxAge?: number;
}

/**
 * Verify an agent's JWT using their stored public key.
 * Returns the decoded payload or null if verification fails.
 */
export async function verifyAgentJWT(
	options: VerifyAgentJWTOptions,
): Promise<Record<string, unknown> | null> {
	try {
		const key = await importJWK(options.publicKey, "EdDSA");
		const { payload } = await jwtVerify(options.jwt, key, {
			maxTokenAge: `${options.maxAge ?? 120}s`,
		});
		return payload.sub ? (payload as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}
