export * from "./organization";
export * from "./two-factor";
export * from "./username";
export * from "./bearer";
export * from "../types/plugins";
export * from "../utils/hide-metadata";
export * from "./magic-link";
export * from "./phone-number";
export * from "./anonymous";
export * from "./admin";
export * from "./generic-oauth";
export * from "./jwt";
export * from "./multi-session";
export * from "./email-otp";
export * from "./one-tap";
export * from "./oauth-proxy";
export * from "./oauth-provider";
export * from "./custom-session";
export * from "./open-api";
export * from "./oidc-provider";
export * from "./captcha";
export * from "./api-key";
export * from "./haveibeenpwned";
export * from "./one-time-token";
export * from "./mcp";
export * from "./siwe";
export * from "./device-authorization";
export * from "./last-login-method";
/**
 * @deprecated Please import from `better-auth/api` directly.
 */
export {
	createAuthEndpoint,
	createAuthMiddleware,
	optionsMiddleware,
	type AuthEndpoint,
	type AuthMiddleware,
} from "@better-auth/core/api";
