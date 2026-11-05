"use server";

import { getRequest } from "waku/router/server";
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
}
