import { type Session } from "./../../types";
import { describe, expect, expectTypeOf, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createAuthClient } from "../../client";
import { inferAdditionalFields } from "./client";
import { twoFactor, twoFactorClient } from "../two-factor";

describe("additionalFields", async () => {
	const { auth, signInWithTestUser, customFetchImpl, sessionSetter } =
		await getTestInstance({
			plugins: [twoFactor()],
			user: {
				additionalFields: {
					newField: {
						type: "string",
						defaultValue: "default-value",
					},
					nonRequiredFiled: {
						type: "string",
						required: false,
					},
				},
			},
		});

	it("should extends fields", async () => {
		const { headers } = await signInWithTestUser();
		const res = await auth.api.getSession({
			headers,
		});
		expect(res?.user.newField).toBeDefined();
		expect(res?.user.nonRequiredFiled).toBeNull();
	});

	it("should require additional fields on signUp", async () => {
		await auth.api
			.signUpEmail({
				body: {
					email: "test@test.com",
					name: "test",
					password: "test-password",
					newField: "new-field",
					nonRequiredFiled: "non-required-field",
				},
			})
			.catch(() => {});

		const client = createAuthClient({
			plugins: [
				inferAdditionalFields({
					user: {
						newField: {
							type: "string",
						},
						nonRequiredFiled: {
							type: "string",
							defaultValue: "test",
						},
					},
				}),
			],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const headers = new Headers();
		await client.signUp.email(
			{
				email: "test3@test.com",
				name: "test3",
				password: "test-password",
				newField: "new-field",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		const res = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data?.user.newField).toBe("new-field");
	});

	it("should infer additional fields on update", async () => {
		const client = createAuthClient({
			plugins: [
				inferAdditionalFields({
					user: {
						newField: {
							type: "string",
						},
					},
				}),
			],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		const headers = new Headers();
		await client.signUp.email(
			{
				email: "test5@test.com",
				name: "test5",
				password: "test-password",
				newField: "new-field",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		const res = await client.updateUser({
			name: "test",
			newField: "updated-field",
			fetchOptions: {
				headers,
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(session?.user.newField).toBe("updated-field");
	});

	it("should work with other plugins", async () => {
		const client = createAuthClient({
			plugins: [
				inferAdditionalFields({
					user: {
						newField: {
							type: "string",
							required: true,
						},
					},
				}),
				twoFactorClient(),
			],
			baseURL: "http://localhost:3000",
			fetchOptions: {
				customFetchImpl,
			},
		});
		expectTypeOf(client.twoFactor).toMatchTypeOf<{}>();

		const headers = new Headers();
		await client.signUp.email(
			{
				email: "test4@test.com",
				name: "test4",
				password: "test-password",
				newField: "new-field",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		const res = await client.updateUser(
			{
				name: "test",
				newField: "updated-field",
			},
			{
				headers,
			},
		);
	});

	it("should infer it on the client", async () => {
		const client = createAuthClient({
			plugins: [inferAdditionalFields<typeof auth>()],
		});
		type t = Awaited<ReturnType<typeof client.getSession>>["data"];
		expectTypeOf<t>().toMatchTypeOf<{
			user: {
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				createdAt: Date;
				updatedAt: Date;
				image?: string | undefined;
				newField: string;
				nonRequiredFiled?: string | undefined;
			};
			session: Session;
		} | null>;
	});

	it("should infer it on the client without direct import", async () => {
		const client = createAuthClient({
			plugins: [
				inferAdditionalFields({
					user: {
						newField: {
							type: "string",
						},
					},
				}),
			],
		});
		type t = Awaited<ReturnType<typeof client.getSession>>["data"];
		expectTypeOf<t>().toMatchTypeOf<{
			user: {
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				createdAt: Date;
				updatedAt: Date;
				image?: string | undefined;
				newField: string;
			};
			session: Session;
		} | null>;
	});
});
