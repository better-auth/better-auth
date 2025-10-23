import {signInSocial, signInEmail} from "./sign-in";
import {callbackOAuth} from "./callback";
import {getSession, listSessions, revokeOtherSessions, revokeSession, revokeSessions} from "./session";
import {signOut} from "./sign-out";
import {forgetPassword, forgetPasswordCallback, requestPasswordReset, requestPasswordResetCallback, resetPassword} from "./reset-password";
import { sendVerificationEmail, verifyEmail } from "./email-verification";
import { changeEmail, changePassword, deleteUser, deleteUserCallback, setPassword, updateUser } from "./update-user";
export * from "./error";
export * from "./ok";
import {signUpEmail} from "./sign-up";
import { accountInfo, getAccessToken, linkSocialAccount, listUserAccounts, refreshToken, unlinkAccount } from "./account";
import type { BetterAuthOptions } from "@better-auth/core";

export type AllRoutes<Options extends BetterAuthOptions = BetterAuthOptions> = {
		signInSocial: typeof signInSocial,
		callbackOAuth: typeof callbackOAuth,
		getSession: ReturnType<typeof getSession<Options>>,
		signOut: typeof signOut,
		signUpEmail: ReturnType<typeof signUpEmail<Options>>,
		signInEmail: typeof signInEmail,
		forgetPassword: typeof forgetPassword,
		resetPassword: typeof resetPassword,
		verifyEmail: typeof verifyEmail,
		sendVerificationEmail: typeof sendVerificationEmail,
		changeEmail: typeof changeEmail,
		changePassword: typeof changePassword,
		setPassword: typeof setPassword,
		updateUser: ReturnType<typeof updateUser<Options>>,
		deleteUser: typeof deleteUser,
		forgetPasswordCallback: typeof forgetPasswordCallback,
		requestPasswordReset: typeof requestPasswordReset,
		requestPasswordResetCallback: typeof requestPasswordResetCallback,
		listSessions: ReturnType<typeof listSessions<Options>>,
		revokeSession: typeof revokeSession,
		revokeSessions: typeof revokeSessions,
		revokeOtherSessions: typeof revokeOtherSessions,
		linkSocialAccount: typeof linkSocialAccount,
		listUserAccounts: typeof listUserAccounts,
		deleteUserCallback: typeof deleteUserCallback,
		unlinkAccount: typeof unlinkAccount,
		refreshToken: typeof refreshToken,
		getAccessToken: typeof getAccessToken,
		accountInfo: typeof accountInfo,
	};

export {
  signInSocial,
  callbackOAuth,
  getSession,
  signOut,
  signUpEmail,
  signInEmail,
  forgetPassword,
  resetPassword,
  verifyEmail,
  sendVerificationEmail,
  changeEmail,
  changePassword,
  setPassword,
  updateUser,
  deleteUser,
  forgetPasswordCallback,
  requestPasswordReset,
  requestPasswordResetCallback,
  listSessions,
  revokeSession,
  revokeSessions,
  revokeOtherSessions,
  linkSocialAccount,
  listUserAccounts,
  deleteUserCallback,
  unlinkAccount,
  refreshToken,
  getAccessToken,
  accountInfo,
}