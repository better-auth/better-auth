import { getBaseURL } from "../utils/base-url";

export function getRedirectURI(providerId: string, redirectURI?: string) {
	return redirectURI || `${getBaseURL()}/callback/${providerId}`;
}
