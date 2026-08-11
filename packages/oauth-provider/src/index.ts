export { getIssuer } from "./authorize";
export {
	DEVICE_CODE_GRANT_TYPE,
	type OAuthDeviceAuthorizationOptions,
	oauthDeviceAuthorization,
} from "./device-code";
export { extendOAuthProvider } from "./extensions";
export {
	authServerMetadata,
	metadataResponse,
	oauthAuthorizationServerMetadata,
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
	oidcServerMetadata,
} from "./metadata";
export {
	DEFAULT_OAUTH_SCOPES,
	getOAuthProviderState,
	oauthProvider,
} from "./oauth";
export type {
	OAuthEndpointErrorResult,
	OAuthEndpointRedirectContext,
	OAuthErrorCode,
	OAuthFieldErrorCode,
	OAuthFieldErrorCodeMap,
	OAuthRedirectOnError,
} from "./oauth-endpoint";
export { createResourceServerChallenge } from "./resource-challenge";
export { getOAuthProviderApi } from "./token";
export type * from "./types";
export type { OAuthClient, ResourceServerMetadata } from "./types/oauth";
export type { OAuthClientMetadata } from "./types/zod";
export {
	oauthClientMetadataSchema,
	ResourceUriSchema,
} from "./types/zod";
export { consumeClientAssertion } from "./utils/client-assertion";
