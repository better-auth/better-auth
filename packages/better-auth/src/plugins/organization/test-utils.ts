import { getTestInstance } from "../../test-utils/test-instance";
import { organizationClient } from "./client";
import { organization } from "./organization";
import type { OrganizationOptions } from "./types";

export async function getOrgTestInstance<
	O extends {
		disableDefaultOrg?: boolean;
		organizationOptions?: OrganizationOptions;
		clientWithTeams?: boolean;
	},
>(opts?: O) {
	const { auth, signInWithTestUser, cookieSetter, client } =
		await getTestInstance(
			{
				plugins: [
					organization({
						...opts?.organizationOptions,
					} as {
						teams: { enabled: true };
					}),
				],
			},
			{
				clientOptions: {
					plugins: [
						opts?.clientWithTeams
							? organizationClient({
									teams: { enabled: true },
								})
							: organizationClient(),
					],
				},
			},
		);
	const { headers, user, session } = await signInWithTestUser();
	const $ctx = await auth.$context;
	return {
		client,
		$ctx,
		auth,
		signInWithTestUser,
		cookieSetter,
		testUser: {
			user,
			session,
		},
		organization: opts?.disableDefaultOrg
			? undefined
			: await client.organization
					.create({
						name: "test",
						slug: "test",
						fetchOptions: {
							headers,
						},
					})
					.then((res) => res.data),
		headers,
	};
}
