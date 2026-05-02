export { ForgotPasswordTemplate } from "./forgot-password";
export { EmbedWrapper, PageWrapper } from "./page-wrapper";
export { ProfileTemplate } from "./profile";
export { ResetPasswordTemplate } from "./reset-password";
export { SignInTemplate } from "./sign-in";
export { SignUpTemplate } from "./sign-up";
export { VerifyEmailTemplate } from "./verify-email";

export type PageName =
	| "sign-in"
	| "sign-up"
	| "forgot-password"
	| "reset-password"
	| "verify-email"
	| "profile";
