/**
 * @deprecated Please import from `better-auth/api` directly.
 */
export {
	type AuthEndpoint,
	type AuthMiddleware,
	createAuthEndpoint,
	createAuthMiddleware,
	optionsMiddleware,
} from "@better-auth/core/api";
export * from "../types/plugins";
export * from "../utils/hide-metadata";
export * from "./access";
export * from "./admin";
export * from "./anonymous";
export * from "./api-key";
export * from "./bearer";
export * from "./captcha";
export * from "./custom-session";
export * from "./device-authorization";
export * from "./email-otp";
export * from "./generic-oauth";
export * from "./haveibeenpwned";
export * from "./jwt";
export * from "./last-login-method";
export * from "./magic-link";
export * from "./mcp";
export * from "./multi-session";
export * from "./oauth-proxy";
export * from "./oidc-provider";
export * from "./one-tap";
export * from "./one-time-token";
export * from "./open-api";
export * from "./organization";
export * from "./phone-number";
export * from "./siwe";
export * from "./two-factor";
export * from "./username";
