import { createAuthClient } from "better-auth/vue";

export const authClient = createAuthClient();

export const {
	signIn,
	signOut,
	signUp,
	useSession,
	forgetPassword,
	resetPassword,
} = authClient;
