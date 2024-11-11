"use server";

import { auth } from "./auth";

export const signInAction = async () => {
	const res = await auth.api.signInEmail({
		body: {
			email: "test@gmail.com",
			password: "password",
		},
	});
};
