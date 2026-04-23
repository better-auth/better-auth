import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { organization } from "../../plugins/index.js";
import { getTestInstance } from "../../test-utils/test-instance.js";
import { createAuthEndpoint, sessionMiddleware } from "../index.js";
import { requireOrgRole } from "./authorization.js";

const checkOrgAdmin = createAuthEndpoint(
	"/test-check-org-admin",
	{
		method: "GET",
		query: z.object({
			organizationId: z.string(),
		}),
		use: [
			sessionMiddleware,
			requireOrgRole({
				orgIdParam: "organizationId",
				orgIdSource: "query",
				allowedRoles: ["admin"],
			}),
		],
	},
	async (ctx) => {
		return ctx.json({ ok: true });
	},
);

const createAuthorizationTestPlugin = () =>
	({
		id: "test-authorization-plugin" as const,
		endpoints: {
			checkOrgAdmin,
		},
	}) satisfies BetterAuthPlugin;

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"test-authorization-plugin": {
			creator: typeof createAuthorizationTestPlugin;
		};
	}
}

describe("requireOrgRole", () => {
	it("allows members whose multi-role membership includes an allowed role", async () => {
		const { auth, client, sessionSetter } = await getTestInstance(
			{
				plugins: [organization(), createAuthorizationTestPlugin()],
			},
			{
				disableTestUser: true,
			},
		);

		const owner = {
			email: "org-owner@test.com",
			password: "password123",
			name: "Org Owner",
		};
		const member = {
			email: "multi-role-member@test.com",
			password: "password123",
			name: "Multi Role Member",
		};

		await client.signUp.email(owner, { throw: true });
		await client.signUp.email(member, { throw: true });

		const ownerHeaders = new Headers();
		await client.signIn.email(owner, {
			throw: true,
			onSuccess: sessionSetter(ownerHeaders),
		});

		const memberHeaders = new Headers();
		await client.signIn.email(member, {
			throw: true,
			onSuccess: sessionSetter(memberHeaders),
		});

		const org = await auth.api.createOrganization({
			body: {
				name: "Test Organization",
				slug: "test-organization",
			},
			headers: ownerHeaders,
		});

		const memberSession = await auth.api.getSession({
			headers: memberHeaders,
		});
		if (!memberSession?.user?.id) {
			throw new Error("Member session not found");
		}

		await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: memberSession.user.id,
				role: ["member", "admin"],
			},
			headers: ownerHeaders,
		});

		await expect(
			auth.api.checkOrgAdmin({
				query: {
					organizationId: org.id,
				},
				headers: memberHeaders,
			}),
		).resolves.toEqual({ ok: true });
	});
});
