"use server";

import { auth } from "@/lib/auth";

export const singInAction = async (previousState: any, data: FormData) => {
	const email = data.get("email")?.toString();
	const password = data.get("password")?.toString();
	if (!email || !password) {
		return null;
	}
	const res = await auth.api.signInEmail({
		body: {
			email,
			password,
		},
	});
	return res;
};
