import type { User } from "better-auth";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vitest";
import { scim } from ".";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";

describe("SCIM canonical User profiles", () => {
	it("round-trips provider-standard names, displayName, and typed emails", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as { id: string; serializedEmails: string }[],
			scimGroupMember: [] as { id: string }[],
			scimProjectionGrant: [] as { id: string }[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
						},
					],
				}),
			],
		});
		const headers = { authorization: "Bearer test-scim-token" };

		const created = await auth.api.createSCIMUser({
			body: {
				schemas: [USER_SCHEMA],
				userName: "Ada.Login@Example.com",
				displayName: "Countess of Lovelace",
				name: {
					formatted: "Augusta Ada King, Countess of Lovelace",
					givenName: "Augusta Ada",
					familyName: "King",
				},
				emails: [
					{
						value: "ada.shared@example.com",
						type: "home",
						primary: true,
					},
					{ value: "ada.shared@example.com", type: "work" },
					{ value: "ada.alias@example.com", type: "work" },
				],
			},
			headers,
		});
		const retrieved = await auth.api.getSCIMUser({
			params: { userId: created.id },
			headers,
		});

		expect(retrieved).toMatchObject({
			schemas: [USER_SCHEMA],
			id: created.id,
			userName: "Ada.Login@Example.com",
			displayName: "Countess of Lovelace",
			name: {
				formatted: "Augusta Ada King, Countess of Lovelace",
				givenName: "Augusta Ada",
				familyName: "King",
			},
			emails: [
				{
					value: "ada.shared@example.com",
					type: "home",
					primary: true,
				},
				{
					value: "ada.shared@example.com",
					type: "work",
					primary: false,
				},
				{
					value: "ada.alias@example.com",
					type: "work",
					primary: false,
				},
			],
		});
		expect(JSON.parse(data.scimUser[0]?.serializedEmails ?? "[]")).toEqual(
			retrieved.emails,
		);
		expect(data.user[0]).toMatchObject({
			email: "ada.shared@example.com",
			name: "Countess of Lovelace",
		});

		const persisted = data.scimUser[0];
		if (!persisted) throw new Error("Expected the persisted SCIM User");
		persisted.serializedEmails = "corrupt";
		await expect(
			auth.api.getSCIMUser({
				params: { userId: created.id },
				headers,
			}),
		).rejects.toThrowError(
			expect.objectContaining({
				statusCode: 500,
				body: expect.objectContaining({
					detail: "Stored SCIM User email state is invalid",
				}),
			}),
		);
	});
});
