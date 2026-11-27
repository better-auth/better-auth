import { auth } from "#lib/auth.js";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ locals }) => ({
	userName: locals.userName,
});

export const actions: Actions = {
	default: async ({ request }) => {
		const form = await request.formData();
		await auth.api.signUpEmail({
			body: {
				name: String(form.get("name")),
				email: String(form.get("email")),
				password: String(form.get("password")),
			},
			headers: request.headers,
		});
	},
};
