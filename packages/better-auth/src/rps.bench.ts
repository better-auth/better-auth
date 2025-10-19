import { bench as vtBench, describe } from "vitest";
import { Bench, type BenchOptions } from "tinybench";
import type { SuccessContext } from "./client";
import { getTestInstance } from "./test-utils/test-instance";
import {
	type BetterAuthOptions,
	type ClientOptions,
	type User,
	type Session,
	type Adapter,
	type Auth,
	betterAuth,
} from "./index";

interface Context {
	testUser: {
		id?: string | undefined;
		createdAt?: Date | undefined;
		updatedAt?: Date | undefined;
		email: string;
		emailVerified?: boolean | undefined;
		name: string;
		image?: string | null | undefined;
		password: string;
	};
	signInWithTestUser: () => Promise<{
		session: Session;
		user: User;
		headers: Headers;
		setCookie: (name: string, value: string) => void;
	}>;
	signInWithUser: (
		email: string,
		password: string,
	) => Promise<{
		res: {
			session: Session;
			user: User;
		};
		headers: Headers;
	}>;
	cookieSetter: (context: SuccessContext) => void;
	sessionSetter: (context: SuccessContext) => void;
	db: Adapter;
	api: Auth["api"];
}

interface EndpointConfig<K extends string> {
	name: K;
	method: string;
	path: string;
	requiresAuth?: boolean;
	payload?: any;
	query?: any;
	param?: any;
	header?: any;
	cookie?: any;
	setup?: (ctx: Context) => Promise<{ headers?: HeadersInit } | void>;
	before?: (ctx: Context) => Promise<{ headers?: HeadersInit } | void>;
	after?: (ctx: Context) => Promise<void>;
	teardown?: (ctx: Context) => Promise<void>;
}

interface RPSBenchmarkOptions<K extends string> {
	config?: BenchOptions | undefined;
	endpoints: (K extends any ? EndpointConfig<K> : never)[];
	debug?: boolean;
	extraOpts?: BetterAuthOptions;
	extraTestOpts?: {
		clientOptions?: ClientOptions;
		port?: number;
		disableTestUser?: boolean;
		testUser?: Partial<User>;
		testWith?: "sqlite" | "postgres" | "mongodb" | "mysql";
	};
}

const testUser = {
	email: "test@test.com",
	password: "test123456",
	name: "test user",
};

export class RPSBenchmark {
	async run<K extends string>(options: RPSBenchmarkOptions<K>) {
		const {
			config = {
				throws: true,
			},
			endpoints,
			debug,
			extraOpts,
			extraTestOpts,
		} = options;
		const coldStartBench = new Bench({
			throws: true,
		});
		const bench = new Bench(config);

		describe("Cold Start", async () => {
			coldStartBench.add("betterAuth initialization", async () => {
				const a = betterAuth({
					emailAndPassword: { enabled: true },
					rateLimit: { enabled: false },
					baseURL: "http://localhost:3000",
				});
				await a.handler(new Request("http://localhost:3000/api/auth/ok"));
			});
		});

		describe("RPS Benchmark", async () => {
			const {
				client,
				auth: { options, api },
				customFetchImpl,
				cookieSetter: cS,
				sessionSetter: sS,
				...rest
			} = await getTestInstance(
				{
					emailVerification: {
						async sendVerificationEmail({ user, url, token: _token }) {},
					},
					emailAndPassword: { enabled: true },
					rateLimit: { enabled: false },
					...extraOpts,
				},
				{
					clientOptions: { fetchOptions: { throw: true } },
					disableTestUser: true,
					// testUser,
					...extraTestOpts,
				},
			);

			for (const {
				name,
				method,
				path,
				setup,
				before,
				after,
				teardown,
				...endpoint
			} of endpoints) {
				let headers: HeadersInit = new Headers({
					"Content-Type": "application/json",
				});
				const cookieSetter = cS(headers);
				const sessionSetter = sS(headers);

				const f = async () =>
					client.$fetch(path, {
						...(endpoint.payload && {
							body: JSON.stringify(endpoint.payload),
						}),
						headers,
						query: endpoint.query,
						method: method.toUpperCase(),
						params: endpoint.param,
						customFetchImpl,
					});

				if (debug !== true)
					bench.add(name, f, {
						...(setup && {
							async beforeAll(this, ctx) {
								const res = await setup({
									api,
									cookieSetter,
									sessionSetter,
									...rest,
								});
								if (typeof res === "object" && "headers" in res && res.headers)
									headers = res.headers;
							},
						}),
						...(before && {
							async beforeEach(this, ctx) {
								const res = await before({
									api,
									cookieSetter,
									sessionSetter,
									...rest,
								});
								if (typeof res === "object" && "headers" in res && res.headers)
									headers = res.headers;
							},
						}),
						...(after && {
							async afterEach(this, ctx) {
								await after({
									api,
									cookieSetter,
									sessionSetter,
									...rest,
								});
							},
						}),
						...(teardown && {
							async afterAll(this, ctx) {
								await teardown({
									api,
									cookieSetter,
									sessionSetter,
									...rest,
								});
							},
						}),
					});

				vtBench.runIf(debug === true)(
					"Debug",
					async () => {
						const res1 = await setup?.({
							api,
							cookieSetter,
							sessionSetter,
							...rest,
						});
						if (typeof res1 === "object" && "headers" in res1 && res1.headers)
							headers = res1.headers;

						const res2 = await before?.({
							api,
							cookieSetter,
							sessionSetter,
							...rest,
						});
						if (typeof res2 === "object" && "headers" in res2 && res2.headers)
							headers = res2.headers;

						const res3 = await f();
						console.log(name, res3);

						await after?.({
							api,
							cookieSetter,
							sessionSetter,
							...rest,
						});

						await teardown?.({
							api,
							cookieSetter,
							sessionSetter,
							...rest,
						});
					},
					{
						time: 0,
						iterations: 1,
						warmupTime: 0,
						warmupIterations: 0,
						throws: true,
					},
				);
			}

			if (debug !== true) {
				await coldStartBench.run();
				await bench.run();
				vtBench(
					"Ignore me",
					void (() => {
						console.table(coldStartBench.table());
						console.table(bench.table());
					})(),
					{
						time: 0,
						iterations: 1,
						warmupTime: 0,
						warmupIterations: 0,
						throws: true,
					},
				);
			}
		});
	}

	static createSignUpBenchmark(debug?: boolean) {
		// Helper function to create and authenticate a user
		const setupAuthenticatedUser = async (ctx: Context) => {
			await ctx.api.signUpEmail({ body: testUser });
			ctx.cookieSetter({
				response: await ctx.api.signInEmail({
					body: testUser,
					asResponse: true,
				}),
			} as any);
		};

		// Helper function to clean up test user
		const cleanupTestUser = async (ctx: Context) => {
			await ctx.db.delete<User>({
				model: "user",
				where: [
					{
						field: "email",
						value: testUser.email,
					},
				],
			});
		};

		return new RPSBenchmark().run({
			endpoints: [
				{
					name: "signUpEmail",
					method: "post",
					path: "/sign-up/email",
					payload: testUser,
					after: cleanupTestUser,
				},
				{
					name: "signInEmail",
					method: "post",
					path: "/sign-in/email",
					payload: testUser,
					before: async (ctx) =>
						void (await ctx.api.signUpEmail({ body: testUser })),
					after: cleanupTestUser,
				},
				{
					name: "getSession",
					method: "get",
					path: "/get-session",
					setup: setupAuthenticatedUser,
					teardown: cleanupTestUser,
				},
				{
					name: "listSessions",
					method: "get",
					path: "/list-sessions",
					setup: setupAuthenticatedUser,
					teardown: cleanupTestUser,
				},
				{
					name: "sendVerificationEmail",
					method: "post",
					path: "/send-verification-email",
					payload: { email: testUser.email },
					setup: setupAuthenticatedUser,
					teardown: cleanupTestUser,
				},
				{
					name: "updateUser",
					method: "post",
					path: "/update-user",
					payload: {
						name: "Benchmark Updated Name",
						image: "https://example.com/benchmark-image.jpg",
					},
					setup: setupAuthenticatedUser,
					teardown: cleanupTestUser,
				},
				{
					name: "changePassword",
					method: "post",
					path: "/change-password",
					payload: {
						newPassword: "benchmarkNewPassword123",
						currentPassword: testUser.password,
						revokeOtherSessions: false,
					},
					setup: setupAuthenticatedUser,
					teardown: cleanupTestUser,
				},
				{
					name: "listAccounts",
					method: "get",
					path: "/list-accounts",
					setup: setupAuthenticatedUser,
					teardown: cleanupTestUser,
				},
				{
					name: "signOut",
					method: "post",
					path: "/sign-out",
					setup: setupAuthenticatedUser,
					teardown: cleanupTestUser,
				},
				{
					name: "deleteUser",
					method: "post",
					path: "/delete-user",
					payload: {
						password: testUser.password,
					},
					setup: setupAuthenticatedUser,
					teardown: cleanupTestUser,
				},
				{
					name: "ok",
					method: "get",
					path: "/ok",
				},
				{
					name: "error",
					method: "get",
					path: "/error",
				},
			],
			extraOpts: { user: { deleteUser: { enabled: true } } },
			debug,
		});
	}
}

export const authRPS = RPSBenchmark.createSignUpBenchmark();
