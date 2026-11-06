"use server";

import { getRequest, unstable_redirect as redirect } from "waku/router/server";
import { auth } from "./auth";

export async function signUp(formData: FormData) {
	await auth.api.signUpEmail({
		body: {
			name: String(formData.get("name")),
			email: String(formData.get("email")),
			password: String(formData.get("password")),
		},
		headers: getRequest().headers,
	});
	redirect("/dashboard");
}

export async function signOut() {
	await auth.api.signOut({ headers: getRequest().headers });
	redirect("/dashboard");
}
