import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { organization } from "../organization";

function createSecondaryStorage(): NonNullable<
	BetterAuthOptions["secondaryStorage"]
> {
	const store = new Map<string, string>();
	return {
		get(key) {
			return store.get(key) ?? null;
		},
		getAndDelete(key) {
			const value = store.get(key) ?? null;
			store.delete(key);
			return value;
		},
		increment(key) {
			const count = Number(store.get(key) ?? 0) + 1;
			store.set(key, String(count));
			return count;
		},
		set(key, value) {
			store.set(key, value);
		},
		delete(key) {
			store.delete(key);
		},
	};
}

function activeOrganizationId(session: { token: string }) {
	return (
		session as typeof session & {
			activeOrganizationId?: string | null | undefined;
		}
	).activeOrganizationId;
}

function sessionToken(result: object): string {
	const { token } = result as { token?: unknown };
	if (typeof token !== "string")
		throw new Error("session token was not returned");
	return token;
}

describe("member session organization selection cleanup", () => {
	it.each([
		{ name: "database sessions", secondaryStorage: undefined },
		{
			name: "secondary-storage sessions",
			secondaryStorage: createSecondaryStorage(),
		},
	])("clears every selected session after removal and leave with $name", async ({
		secondaryStorage,
	}) => {
		const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
			plugins: [organization()],
			...(secondaryStorage ? { secondaryStorage } : {}),
		});
		const ctx = await auth.$context;
		const owner = await signInWithTestUser();

		const removedOrganization = await auth.api.createOrganization({
			headers: owner.headers,
			body: { name: "Removed organization", slug: "removed-organization" },
		});
		const leftOrganization = await auth.api.createOrganization({
			headers: owner.headers,
			body: { name: "Left organization", slug: "left-organization" },
		});
		const retainedOrganization = await auth.api.createOrganization({
			headers: owner.headers,
			body: { name: "Retained organization", slug: "retained-organization" },
		});
		if (!removedOrganization || !leftOrganization || !retainedOrganization) {
			throw new Error("failed to create test organizations");
		}

		const removedUser = await auth.api.signUpEmail({
			body: {
				email: "removed-member@example.com",
				name: "Removed member",
				password: "password12345",
			},
		});
		await auth.api.addMember({
			body: {
				userId: removedUser.user.id,
				organizationId: removedOrganization.id,
				role: "member",
			},
		});
		await auth.api.addMember({
			body: {
				userId: removedUser.user.id,
				organizationId: retainedOrganization.id,
				role: "member",
			},
		});
		const removedSessionOne = await signInWithUser(
			removedUser.user.email,
			"password12345",
		);
		const removedSessionTwo = await signInWithUser(
			removedUser.user.email,
			"password12345",
		);
		const removedSessionThree = await signInWithUser(
			removedUser.user.email,
			"password12345",
		);
		await auth.api.setActiveOrganization({
			headers: removedSessionOne.headers,
			body: { organizationId: removedOrganization.id },
		});
		await auth.api.setActiveOrganization({
			headers: removedSessionTwo.headers,
			body: { organizationId: removedOrganization.id },
		});
		await auth.api.setActiveOrganization({
			headers: removedSessionThree.headers,
			body: { organizationId: retainedOrganization.id },
		});

		await auth.api.removeMember({
			headers: owner.headers,
			body: {
				organizationId: removedOrganization.id,
				memberIdOrEmail: removedUser.user.email,
			},
		});

		const removedSessions = new Map(
			(await ctx.internalAdapter.listSessions(removedUser.user.id)).map(
				(session) => [session.token, activeOrganizationId(session)],
			),
		);
		expect(removedSessions.get(sessionToken(removedSessionOne.res))).toBeNull();
		expect(removedSessions.get(sessionToken(removedSessionTwo.res))).toBeNull();
		expect(removedSessions.get(sessionToken(removedSessionThree.res))).toBe(
			retainedOrganization.id,
		);

		const leavingUser = await auth.api.signUpEmail({
			body: {
				email: "leaving-member@example.com",
				name: "Leaving member",
				password: "password12345",
			},
		});
		await auth.api.addMember({
			body: {
				userId: leavingUser.user.id,
				organizationId: leftOrganization.id,
				role: "member",
			},
		});
		await auth.api.addMember({
			body: {
				userId: leavingUser.user.id,
				organizationId: retainedOrganization.id,
				role: "member",
			},
		});
		const leavingSessionOne = await signInWithUser(
			leavingUser.user.email,
			"password12345",
		);
		const leavingSessionTwo = await signInWithUser(
			leavingUser.user.email,
			"password12345",
		);
		const leavingSessionThree = await signInWithUser(
			leavingUser.user.email,
			"password12345",
		);
		await auth.api.setActiveOrganization({
			headers: leavingSessionOne.headers,
			body: { organizationId: leftOrganization.id },
		});
		await auth.api.setActiveOrganization({
			headers: leavingSessionTwo.headers,
			body: { organizationId: leftOrganization.id },
		});
		await auth.api.setActiveOrganization({
			headers: leavingSessionThree.headers,
			body: { organizationId: retainedOrganization.id },
		});

		await auth.api.leaveOrganization({
			headers: leavingSessionOne.headers,
			body: { organizationId: leftOrganization.id },
		});

		const leavingSessions = new Map(
			(await ctx.internalAdapter.listSessions(leavingUser.user.id)).map(
				(session) => [session.token, activeOrganizationId(session)],
			),
		);
		expect(leavingSessions.get(sessionToken(leavingSessionOne.res))).toBeNull();
		expect(leavingSessions.get(sessionToken(leavingSessionTwo.res))).toBeNull();
		expect(leavingSessions.get(sessionToken(leavingSessionThree.res))).toBe(
			retainedOrganization.id,
		);
	});

	it("refreshes a stale remote cookie before an organization route uses it", async () => {
		const { auth, signInWithTestUser, cookieSetter, customFetchImpl } =
			await getTestInstance({
				plugins: [organization()],
				session: { cookieCache: { enabled: true, maxAge: 60 } },
			});
		const client = createAuthClient({
			plugins: [organizationClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: { customFetchImpl },
		});
		const owner = await signInWithTestUser();
		const removedOrganization = await auth.api.createOrganization({
			headers: owner.headers,
			body: { name: "Cached organization", slug: "cached-organization" },
		});
		const retainedOrganization = await auth.api.createOrganization({
			headers: owner.headers,
			body: {
				name: "Cached retained organization",
				slug: "cached-retained-organization",
			},
		});
		if (!removedOrganization || !retainedOrganization) {
			throw new Error("failed to create organization");
		}

		const targetHeaders = new Headers();
		const target = await client.signUp.email(
			{
				email: "cached-member@example.com",
				name: "Cached member",
				password: "password12345",
			},
			{ onSuccess: cookieSetter(targetHeaders) },
		);
		if (!target.data) throw new Error("failed to create target user");
		await auth.api.addMember({
			body: {
				userId: target.data.user.id,
				organizationId: removedOrganization.id,
				role: "member",
			},
		});
		await auth.api.addMember({
			body: {
				userId: target.data.user.id,
				organizationId: retainedOrganization.id,
				role: "member",
			},
		});
		await client.organization.setActive({
			organizationId: removedOrganization.id,
			fetchOptions: {
				headers: targetHeaders,
				onSuccess: cookieSetter(targetHeaders),
			},
		});

		await auth.api.removeMember({
			headers: owner.headers,
			body: {
				organizationId: removedOrganization.id,
				memberIdOrEmail: target.data.user.email,
			},
		});

		// The server cannot push-delete a signed cache cookie on another device.
		const cachedSession = await client.getSession({
			fetchOptions: { headers: targetHeaders },
		});
		expect(cachedSession.data?.session.activeOrganizationId).toBe(
			removedOrganization.id,
		);

		// Organization middleware bypasses that cache, observes the cleared
		// server session, and refreshes the response cookie before the handler runs.
		const activeOrganization = await client.organization.getFullOrganization({
			fetchOptions: {
				headers: targetHeaders,
				onSuccess: cookieSetter(targetHeaders),
			},
		});
		expect(activeOrganization.error).toBeNull();
		expect(activeOrganization.data).toBeNull();

		const refreshedSession = await client.getSession({
			fetchOptions: { headers: targetHeaders },
		});
		expect(refreshedSession.data?.session.activeOrganizationId).toBeNull();

		await client.organization.setActive({
			organizationId: retainedOrganization.id,
			fetchOptions: {
				headers: targetHeaders,
				onSuccess: cookieSetter(targetHeaders),
			},
		});
		const leave = await client.organization.leave(
			{ organizationId: retainedOrganization.id },
			{
				headers: targetHeaders,
				onSuccess: cookieSetter(targetHeaders),
			},
		);
		expect(leave.error).toBeNull();

		const sessionAfterLeave = await client.getSession({
			fetchOptions: { headers: targetHeaders },
		});
		expect(sessionAfterLeave.data?.session.activeOrganizationId).toBeNull();
	});
});
