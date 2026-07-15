/**
 * Default English message dictionary for Auth UI.
 *
 * Keys use dot-notation so consumers can override individual strings
 * via `ui.messages` without needing a full locale file.
 */
export const defaultMessages: Record<string, string> = {
	// Sign-in page
	"signIn.title": "Sign In",
	"signIn.description": "Enter your email below to login to your account.",
	"signIn.submit": "Login",
	"signIn.signingIn": "Signing in...",
	"signIn.success": "Signed in successfully.",
	"signIn.error": "Could not sign in.",

	// Sign-in with username
	"signIn.username.title": "Sign in with username",
	"signIn.username.description": "Use your username and password to continue.",
	"signIn.username.submit": "Login",
	"signIn.username.error": "Could not sign in with username.",
	"signIn.username.preferEmail": "Prefer email?",
	"signIn.username.useEmailInstead": "Use email instead",
	"signIn.username.signInWithEmail": "Sign in with email",

	// Sign-in with phone
	"signIn.phone.title": "Sign in with phone",
	"signIn.phone.description":
		"Use your phone number to sign in with password or a one-time code.",
	"signIn.phone.unavailableTitle": "Phone sign-in unavailable",
	"signIn.phone.unavailableDescription":
		"Phone number sign-in is not enabled on this server.",
	"signIn.phone.error": "Could not sign in with phone number.",
	"signIn.phone.preferEmail": "Prefer email?",
	"signIn.phone.signInWithEmail": "Sign in with email",
	"signIn.phone.useADifferentPhoneNumber": "Use a different phone number",

	// Sign-up page
	"signUp.title": "Sign Up",
	"signUp.description": "Enter your information to create an account.",
	"signUp.submit": "Create account",
	"signUp.creatingAccount": "Creating your account...",
	"signUp.success": "Account created successfully.",
	"signUp.error": "Could not create your account.",
	"signUp.disabledTitle": "Sign up disabled",
	"signUp.disabledDescription":
		"Account creation is currently disabled by the administrator.",

	// Forgot password
	"forgotPassword.title": "Reset your password",
	"forgotPassword.description":
		"Enter your email and we'll send you a reset link.",
	"forgotPassword.submit": "Send reset link",
	"forgotPassword.sending": "Sending reset link...",
	"forgotPassword.success": "If this email exists, a reset link has been sent.",
	"forgotPassword.error": "Could not send reset link.",
	"forgotPassword.rememberPassword": "Remember your password?",

	// Reset password
	"resetPassword.title": "Choose a new password",
	"resetPassword.description":
		"Use a new password that you have not used before.",
	"resetPassword.submit": "Reset password",
	"resetPassword.resetting": "Resetting password...",
	"resetPassword.success": "Password reset successfully.",
	"resetPassword.error": "Could not reset password.",
	"resetPassword.backTo": "Back to",

	// Verify email
	"verifyEmail.title": "Verify your email",
	"verifyEmail.description": "Send a fresh verification link to your inbox.",
	"verifyEmail.submit": "Send verification email",
	"verifyEmail.sending": "Sending verification email...",
	"verifyEmail.success": "Verification email sent.",
	"verifyEmail.error": "Could not send verification email.",

	// Auth tabs
	"tabs.signIn": "Sign In",
	"tabs.signUp": "Sign Up",

	// Common field labels
	"field.email": "Email",
	"field.password": "Password",
	"field.newPassword": "New password",
	"field.name": "Name",
	"field.username": "Username",
	"field.displayName": "Display name",
	"field.phoneNumber": "Phone number",

	// Common field placeholders
	"placeholder.email": "m@example.com",
	"placeholder.password": "password",
	"placeholder.name": "Enter your name",
	"placeholder.username": "Choose a username",
	"placeholder.displayName": "How your name should appear",
	"placeholder.newPassword": "Enter your new password",
	"placeholder.emailAddress": "Enter your email address",
	"placeholder.phoneNumber": "+1 555 555 5555",
	"placeholder.enterUsername": "Enter your username",

	// Common controls
	"action.forgotPassword": "Forgot your password?",
	"action.rememberMe": "Remember me",
	"action.backToSignIn": "Back to sign in",
	"action.signIn": "Sign in",
	"action.signInWithPhone": "Sign in with phone number",

	// Legal
	"legal.agreeTo": "I agree to the",
	"legal.termsOfService": "Terms of Service",
	"legal.privacyPolicy": "Privacy Policy",
	"legal.and": "and",
	"legal.bySigningIn": "By signing in, you agree to the",
	"legal.bySigningUp": "By signing up, you agree to the",

	// Social / providers
	"provider.signInWith": "Sign in with",
	"provider.signUpWith": "Sign up with",
	"provider.redirecting": "Redirecting to {provider}...",
	"provider.error": "Could not continue with {provider}.",

	// Passkey
	"passkey.signIn": "Sign in with Passkey",
	"passkey.startingSignIn": "Starting passkey sign in...",
	"passkey.signInSuccess": "Signed in with passkey.",
	"passkey.signInError": "Could not sign in with passkey.",
	"passkey.addTitle": "Add a passkey",
	"passkey.addDescription":
		"Your account was created. Add a passkey now for faster, safer sign-ins.",
	"passkey.addSubmit": "Add passkey",
	"passkey.skipForNow": "Skip for now",
	"passkey.startingRegistration": "Starting passkey registration...",
	"passkey.registered": "Passkey registered.",
	"passkey.registerError": "Could not register passkey.",

	// Two-factor
	"twoFactor.verificationTitle": "Two-factor verification",
	"twoFactor.verificationDescription":
		"Confirm it's you with an authenticator code, email/SMS OTP, or backup code.",
	"twoFactor.authenticatorApp": "Authenticator app",
	"twoFactor.authenticatorCode": "Authenticator code",
	"twoFactor.verifyCode": "Verify code",
	"twoFactor.verifyingCode": "Verifying code...",
	"twoFactor.codeVerified": "Two-factor code verified.",
	"twoFactor.codeError": "Could not verify two-factor code.",
	"twoFactor.trustDevice": "Trust this device",
	"twoFactor.oneTimeCode": "One-time code",
	"twoFactor.sendOneTimeCode": "Send one-time code",
	"twoFactor.sendingCode": "Sending code...",
	"twoFactor.oneTimeCodeSent": "One-time code sent.",
	"twoFactor.oneTimeCodeError": "Could not send one-time code.",
	"twoFactor.verifyOneTimeCode": "Verify one-time code",
	"twoFactor.oneTimeCodeVerifyError": "Could not verify one-time code.",
	"twoFactor.backupCode": "Backup code",
	"twoFactor.verifyBackupCode": "Verify backup code",
	"twoFactor.verifyingBackupCode": "Verifying backup code...",
	"twoFactor.backupCodeVerified": "Backup code verified.",
	"twoFactor.backupCodeError": "Could not verify backup code.",

	// Two-factor enrollment
	"twoFactor.enrollTitle": "Secure your account",
	"twoFactor.enrollDescription":
		"Add an authenticator app for an extra verification step.",
	"twoFactor.setupSubmit": "Set up two-factor",
	"twoFactor.preparingSetup": "Preparing two-factor setup...",
	"twoFactor.setupError": "Could not start two-factor setup.",
	"twoFactor.scanQRCode":
		"Scan this QR code with your authenticator app, then enter the code it shows. Save your backup codes somewhere safe.",
	"twoFactor.verifyingAuthenticator": "Verifying authenticator...",
	"twoFactor.enabled": "Two-factor authentication enabled.",
	"twoFactor.verifyAuthenticatorError": "Could not verify authenticator code.",
	"twoFactor.confirmAndContinue": "Confirm and continue",
	"twoFactor.currentPassword": "Current password",

	// Magic link
	"magicLink.sendSubmit": "Send magic link",
	"magicLink.sending": "Sending magic link...",
	"magicLink.success": "Magic link sent. Check your inbox.",
	"magicLink.error": "Could not send magic link.",

	// Email OTP
	"emailOtp.sendSubmit": "Send verification code",
	"emailOtp.sendingCode": "Sending code...",
	"emailOtp.codeSent": "Verification code sent.",
	"emailOtp.sendError": "Could not send verification code.",
	"emailOtp.verificationCode": "Verification code",
	"emailOtp.verifySubmit": "Verify code",
	"emailOtp.verifyingCode": "Verifying code...",
	"emailOtp.verifyError": "Could not verify code.",
	"emailOtp.useADifferentEmail": "Use a different email",

	// Phone OTP
	"phoneOtp.sendSubmit": "Send verification code",
	"phoneOtp.codeSent": "Verification code sent.",
	"phoneOtp.sendError": "Could not send verification code.",
	"phoneOtp.verificationCode": "Verification code",
	"phoneOtp.verifySubmit": "Verify code",
	"phoneOtp.verifyError": "Could not verify code.",

	// Method switcher labels
	"method.password": "Password",
	"method.magicLink": "Magic Link",
	"method.emailCode": "Email Code",
	"method.oneTimeCode": "One-time code",

	// Credential segment
	"credential.email": "Email",
	"credential.username": "Username",

	// Last login method
	"lastLogin.hint":
		"Better Auth can remember the last sign-in method used on this device.",
	"lastLogin.lastUsed": "Last used sign-in method: {method}.",

	// Error
	"error.somethingWentWrong": "Something went wrong.",
};
