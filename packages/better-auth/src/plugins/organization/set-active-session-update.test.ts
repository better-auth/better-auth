import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { organization } from "./organization";

/**
 * `setActiveOrganization` / `setActiveTeam` can return `null` when the session
 * row was not updated (a `session.update.before` hook vetoed the write, or the
 * row is gone). The set-active endpoints must answer with an APIError instead
 * of passing `null` into `setSessionCookie` and failing with a TypeError.
 *
 * @see https://github.com/better-auth/better-auth/issues/11662
 */
describe("set-active endpoints when the session update returns null", async () => {
	let vetoSessionUpdates = false;
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [organization({ teams: { enabled: true } })],
		databaseHooks: {
			session: {
				update: {
					before: async () => (vetoSessionUpdates ? false : undefined),
				},
			},
		},
	});
	const { headers } = await signInWithTestUser();

	const org = await auth.api.createOrganization({
		headers,
		body: { name: "Veto Org", slug: "veto-org" },
	});
	const team = await auth.api.createTeam({
		headers,
		body: { name: "Veto Team", organizationId: org!.id },
	});
	await auth.api.setActiveOrganization({
		headers,
		body: { organizationId: org!.id },
	});
	await auth.api.addTeamMember({
		headers,
		body: {
			teamId: team.id,
			userId: (await auth.api.getSession({ headers }))!.user.id,
		},
	});

	async function expectUnauthorized(call: () => Promise<unknown>) {
		vetoSessionUpdates = true;
		try {
			await expect(call()).rejects.toMatchObject({
				status: "UNAUTHORIZED",
				body: { code: BASE_ERROR_CODES.FAILED_TO_GET_SESSION.code },
			});
		} finally {
			vetoSessionUpdates = false;
		}
	}

	it("setActiveOrganization with an organization id", async () => {
		await expectUnauthorized(() =>
			auth.api.setActiveOrganization({
				headers,
				body: { organizationId: org!.id },
			}),
		);
	});

	it("setActiveOrganization with null", async () => {
		await expectUnauthorized(() =>
			auth.api.setActiveOrganization({
				headers,
				body: { organizationId: null },
			}),
		);
	});

	it("setActiveTeam with a team id", async () => {
		await expectUnauthorized(() =>
			auth.api.setActiveTeam({
				headers,
				body: { teamId: team.id },
			}),
		);
	});

	it("setActiveTeam with null", async () => {
		await auth.api.setActiveTeam({ headers, body: { teamId: team.id } });
		await expectUnauthorized(() =>
			auth.api.setActiveTeam({
				headers,
				body: { teamId: null },
			}),
		);
	});
});
