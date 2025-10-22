import { describe, it, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { loginHistory } from ".";
import { loginHistoryClient } from "./client";
import type { LoginHistoryModel } from "./types";

describe("login-history", async () => {
	const { client, db, testUser, sessionSetter } = await getTestInstance(
		{
			plugins: [loginHistory()],
		},
		{
			clientOptions: {
				plugins: [loginHistoryClient()],
			},
		},
	);

	it("should record login history on sign-in", async () => {
		const { data } = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: {
					"user-agent": "node-fetch",
				},
			},
		);
		expect(data?.token).toBeDefined();
		const userId = data!.user.id;

		const history = await db.findOne<LoginHistoryModel>({
			model: "loginHistory",
			where: [{ field: "userId", operator: "eq", value: userId }],
		});

		expect(history).toBeDefined();
		expect(history?.userId).toBe(userId);
		expect(history?.userAgent).toBe("node-fetch");
	});

	it("should record login history on sign-up", async () => {
		const newUser = {
			email: "new-user@test.com",
			password: "password",
			name: "New User",
		};

		const res = await client.signUp.email(
			{ ...newUser },
			{
				headers: {
					"user-agent": "node-fetch",
				},
			},
		);

		const userId = res.data?.user.id;
		expect(userId).toBeDefined();

		const history = await db.findOne<LoginHistoryModel>({
			model: "loginHistory",
			where: [{ field: "userId", operator: "eq", value: userId! }],
		});

		expect(history).toBeDefined();
		expect(history?.userId).toBe(userId);
		expect(history?.userAgent).toBe("node-fetch");
	});

	it("should return login history for authenticated user", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: {
					"user-agent": "test-agent-1",
				},
				onSuccess: sessionSetter(headers),
			},
		);

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: {
					"user-agent": "test-agent-2",
				},
				onSuccess: sessionSetter(headers),
			},
		);

		const res = await client.loginHistory.list({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toBeDefined();
		expect(Array.isArray(res.data)).toBe(true);
		expect(res.data!.length).toBeGreaterThanOrEqual(2);
		expect(res.data![0]!.userAgent).toBe("test-agent-2");
	});

	it("should use custom ipHeader", async () => {
		const { client, db, testUser } = await getTestInstance(
			{
				plugins: [loginHistory({ ipHeader: "x-real-ip" })],
			},
			{
				clientOptions: {
					plugins: [loginHistoryClient()],
				},
			},
		);

		const { data } = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: {
					"user-agent": "node-fetch",
					"x-real-ip": "1.2.3.4",
				},
			},
		);
		expect(data?.token).toBeDefined();
		const userId = data!.user.id;

		const history = await db.findOne<LoginHistoryModel>({
			model: "loginHistory",
			where: [{ field: "userId", operator: "eq", value: userId }],
		});

		expect(history).toBeDefined();
		expect(history?.userId).toBe(userId);
		expect(history?.ipAddress).toBe("1.2.3.4");
	});

	it("should return an empty array when there is no login history", async () => {
		const headers = new Headers();
		const newUser = {
			email: "no-history@test.com",
			password: "password",
			name: "No History",
		};

		// Sign up a new user, which will create a session and a login history entry.
		const signUpResponse = await client.signUp.email(newUser, {
			onSuccess: sessionSetter(headers),
		});
		const userId = signUpResponse.data?.user.id;
		expect(userId).toBeDefined();

		// Now, delete the login history for this new user to simulate a clean state.
		await db.deleteMany({
			model: "loginHistory",
			where: [{ field: "userId", operator: "eq", value: userId! }],
		});

		const res = await client.loginHistory.list({
			fetchOptions: {
				headers,
			},
		});

		expect(res.data).toEqual([]);
	});
});
