export const signedQueryIssuedAtParam = "ba_iat";
export const postLoginClearedParam = "ba_pl";
const signedQueryParameterNameParam = "ba_param";

export function canonicalizeOAuthQueryParams(params: URLSearchParams) {
	const canonicalParams = new URLSearchParams();
	const entries = [...params.entries()].sort(
		([keyA, valueA], [keyB, valueB]) => {
			if (keyA < keyB) return -1;
			if (keyA > keyB) return 1;
			if (valueA < valueB) return -1;
			if (valueA > valueB) return 1;
			return 0;
		},
	);
	for (const [key, value] of entries) {
		canonicalParams.append(key, value);
	}
	return canonicalParams;
}

export function setSignedOAuthQueryParameterNames(params: URLSearchParams) {
	params.delete(signedQueryParameterNameParam);
	const signedParameterNames = [
		...new Set([...params.keys(), signedQueryParameterNameParam]),
	].sort();

	for (const parameterName of signedParameterNames) {
		params.append(signedQueryParameterNameParam, parameterName);
	}
}

function getSignedOAuthQueryParameterNames(params: URLSearchParams) {
	const signedParameterNames = params.getAll(signedQueryParameterNameParam);
	if (!signedParameterNames.length) {
		return undefined;
	}
	return new Set(signedParameterNames);
}

export function buildSignedOAuthQuery(search: string) {
	const params = new URLSearchParams(search);
	if (!params.has("sig")) {
		return undefined;
	}

	const signedParameterNames = getSignedOAuthQueryParameterNames(params);
	if (!signedParameterNames) {
		return undefined;
	}

	const signedParams = new URLSearchParams();
	for (const [key, value] of params.entries()) {
		if (
			key === "sig" ||
			key === signedQueryParameterNameParam ||
			signedParameterNames.has(key)
		) {
			signedParams.append(key, value);
		}
	}
	return signedParams.toString();
}

export function getSignedQueryIssuedAt(oauthQuery: string): Date | null {
	const raw = new URLSearchParams(oauthQuery).get(signedQueryIssuedAtParam);
	if (!raw) return null;
	const issuedAt = Number(raw);
	if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;
	return new Date(issuedAt);
}
