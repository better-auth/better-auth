/**
 * Minimal ERC-4361 (Sign-In with Ethereum) message parser.
 *
 * The plugin must independently extract the fields it validates (nonce,
 * domain, address, chain id, time bounds) from the *signed* message — the
 * caller-supplied `verifyMessage` cannot be relied on for this, since the
 * documented `verifyMessage` (viem) only recovers the signature and never
 * inspects the message body.
 *
 * Parsing is intentionally tolerant: it extracts the labeled fields it needs
 * and leaves validation (presence + equality against server state) to the
 * caller. It never throws.
 *
 * @see https://eips.ethereum.org/EIPS/eip-4361
 */
export interface ParsedSiweMessage {
	scheme?: string;
	domain?: string;
	address?: string;
	uri?: string;
	version?: string;
	chainId?: number;
	nonce?: string;
	issuedAt?: string;
	expirationTime?: string;
	notBefore?: string;
	requestId?: string;
}

const HEADER_REGEX =
	/^(?:([a-zA-Z][a-zA-Z0-9+.-]*):\/\/)?(\S+) wants you to sign in with your Ethereum account:$/;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const FIELD_REGEX = /^([A-Za-z ]+): (.*)$/;

export function parseSiweMessage(message: string): ParsedSiweMessage {
	const result: ParsedSiweMessage = {};
	// Split tolerantly of CRLF; ERC-4361 uses LF but some wallets emit CRLF.
	const lines = message.split(/\r?\n/);

	const headerMatch = lines[0]?.match(HEADER_REGEX);
	if (headerMatch) {
		if (headerMatch[1]) result.scheme = headerMatch[1];
		result.domain = headerMatch[2];
	}

	const addressLine = lines[1]?.trim();
	if (addressLine && ADDRESS_REGEX.test(addressLine)) {
		result.address = addressLine;
	}

	// Labeled fields appear in the suffix block. Parse them line-by-line so the
	// optional statement (which may itself contain `: `) doesn't break parsing.
	// The suffix fields always win because they come after the statement.
	for (const line of lines) {
		const match = line.match(FIELD_REGEX);
		if (!match) continue;
		const [, key, value] = match;
		switch (key) {
			case "URI":
				result.uri = value;
				break;
			case "Version":
				result.version = value;
				break;
			case "Chain ID": {
				const parsed = Number(value);
				if (Number.isInteger(parsed)) result.chainId = parsed;
				break;
			}
			case "Nonce":
				result.nonce = value;
				break;
			case "Issued At":
				result.issuedAt = value;
				break;
			case "Expiration Time":
				result.expirationTime = value;
				break;
			case "Not Before":
				result.notBefore = value;
				break;
			case "Request ID":
				result.requestId = value;
				break;
		}
	}

	return result;
}

/**
 * Normalizes a SIWE `domain` (RFC 3986 authority) for comparison: strips any
 * scheme and path, lowercases, leaving `host[:port]`.
 */
export function normalizeSiweDomain(domain: string): string {
	const withoutScheme = domain
		.trim()
		.toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
	const pathStart = withoutScheme.indexOf("/");
	return pathStart === -1 ? withoutScheme : withoutScheme.slice(0, pathStart);
}
