import { isCI } from "@better-auth/core/env";
import { existsSync } from "fs";
import { appendFile, mkdir, open } from "fs/promises";
import { join } from "path";
import { Bench, type BenchOptions } from "tinybench";
import { describe, bench as vtBench } from "vitest";
import type { z } from "zod/v4";
import type { router } from "./api";
import type { SuccessContext } from "./client";
import {
	type Adapter,
	type Auth,
	betterAuth,
	type BetterAuthOptions,
	type ClientOptions,
	type Session,
	type User,
} from "./index";
import { getTestInstance } from "./test-utils/test-instance";

enum BenchType {
	COLD_START,
	REQ_SEC,
}

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

const BenchUtils = {
	testUser: {
		email: "test@test.com",
		password: "test123456",
		name: "test user",
	},

	// Helper function to create and authenticate a user
	async setupAuthenticatedUser(ctx: Context) {
		await ctx.api.signUpEmail({ body: BenchUtils.testUser });
		ctx.cookieSetter({
			response: await ctx.api.signInEmail({
				body: BenchUtils.testUser,
				asResponse: true,
			}),
		} as any);
	},

	// Helper function to clean up test user
	async cleanupTestUser(ctx: Context) {
		await ctx.db.delete<User>({
			model: "user",
			where: [
				{
					field: "email",
					value: BenchUtils.testUser.email,
				},
			],
		});
	},

	// Helper function to append benchmarks to markdown file
	async addToTable(
		data: ReturnType<Bench["table"]>,
		filePath: string = "benchmark.md",
	): Promise<void> {
		if (data.length === 0) return;
		const logsPath = join(process.cwd(), "logs");
		const fullPath = join(logsPath, filePath);

		const headers = Object.keys(data[0] ?? {});

		// Create the header and separator rows
		const headerRow = `| ${headers.join(" | ")} |`;
		const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;
		const headerSection = `${headerRow}\n${separatorRow}\n`;

		// Create data rows
		const dataRows =
			data
				.filter((v) => v != null)
				.map((row) => {
					const values = headers.map((header) => String(row[header]));
					return `| ${values.join(" | ")} |`;
				})
				.join("\n") + "\n";

		try {
			// create logs dir if not exists
			if (!existsSync(logsPath)) await mkdir(logsPath);
		} finally {
			try {
				// Try to open file with 'wx' flag - fails if file exists
				const fd = await open(fullPath, "wx");

				// File doesn't exist - write headers + data
				await fd.write(headerSection + dataRows);
				await fd.close();
			} catch (error: any) {
				// File exists - just append data rows
				if (error.code === "EEXIST") await appendFile(fullPath, dataRows);
				// Some other error occurred
				else throw error;
			}
		}
	},
};

type Routes<O extends BetterAuthOptions = BetterAuthOptions> = ReturnType<
	typeof router<O>
>["endpoints"];

interface BenchmarkOptions<O extends BetterAuthOptions> {
	debug?: boolean;
	ci?: boolean;
	config?: BenchOptions;
	authOpts?: O;
}

abstract class BenchmarkBase extends Bench {
	protected debugFns: (() => Promise<void>)[] = [];
	private static display: Record<BenchType, string> = {
		[BenchType.COLD_START]: "Cold start",
		[BenchType.REQ_SEC]: "Requests per second",
	};

	constructor(config?: BenchOptions) {
		super(config);
	}

	protected execute() {
		describe(BenchmarkBase.display[this.getType()], async () => {
			const results: ReturnType<Bench["table"]> = [];
			if (this.isDebug()) for (const fn of this.debugFns) await fn();
			else {
				await this.run();
				results.push(...this.table());
			}

			if (this.isCI()) await BenchUtils.addToTable(results);
			vtBench("Ignore me", void (() => console.table(results))(), {
				time: 0,
				iterations: 1,
				warmupTime: 0,
				warmupIterations: 0,
				throws: true,
			});
		});
	}

	protected abstract getType(): BenchType;
	protected abstract isDebug(): boolean;
	protected abstract isCI(): boolean;
}

interface ColdStartOptions<O extends BetterAuthOptions>
	extends BenchmarkOptions<O> {}

class ColdStartBenchmark<O extends BetterAuthOptions> extends BenchmarkBase {
	constructor(private readonly options: ColdStartOptions<O>) {
		super(options.config);
		this.setup();
	}

	private setup() {
		this.add("betterAuth initialization", async () => {
			const auth = betterAuth({
				emailAndPassword: { enabled: true },
				rateLimit: { enabled: false },
				baseURL: "http://localhost:3000",
				...this.options.authOpts,
			});
			await auth.handler(new Request("http://localhost:3000/api/auth/ok"));
		});
	}

	protected getType() {
		return BenchType.COLD_START;
	}
	protected isDebug() {
		return this.options.debug === true;
	}
	protected isCI() {
		return this.options.ci === true;
	}

	static create(debug?: boolean, ci?: boolean) {
		return new ColdStartBenchmark({
			debug,
			ci,
		}).execute();
	}
}

type EndpointConfig = {
	[K in keyof Routes]: {
		name: K extends string ? K : string;
		method: Routes[K]["options"]["method"] extends (infer A)[]
			? A
			: Routes[K]["options"]["method"];
		path: Routes[K]["path"];
		requiresAuth?: boolean;
		payload?: Routes[K]["options"] extends { body: infer B }
			? z.input<B>
			: Record<string, any>;
		query?: Routes[K]["options"] extends { query: infer Q }
			? z.input<Q>
			: Record<string, any>;
		param?: Routes[K]["options"] extends { param: infer P }
			? z.input<P>
			: Record<string, any>;
		header?: Routes[K]["options"] extends { header: infer H }
			? z.input<H>
			: Record<string, any>;
		cookie?: Routes[K]["options"] extends { cookie: infer C }
			? z.input<C>
			: Record<string, any>;
		setup?: (ctx: Context) => Promise<{ headers?: HeadersInit } | void>;
		before?: (ctx: Context) => Promise<{ headers?: HeadersInit } | void>;
		after?: (ctx: Context) => Promise<void>;
		teardown?: (ctx: Context) => Promise<void>;
	};
}[keyof Routes];

interface RequestSecOptions<O extends BetterAuthOptions>
	extends BenchmarkOptions<O> {
	endpoints: EndpointConfig[];
	testOpts?: {
		clientOptions?: ClientOptions;
		port?: number;
		disableTestUser?: boolean;
		testUser?: Partial<User>;
		testWith?: "sqlite" | "postgres" | "mongodb" | "mysql";
	};
}

class RequestSecBenchmark<O extends BetterAuthOptions> extends BenchmarkBase {
	constructor(private readonly options: RequestSecOptions<O>) {
		super(options.config);
	}

	async setup() {
		const { endpoints, testOpts: extraTestOpts } = this.options;
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
				...this.options.authOpts,
			},
			{
				clientOptions: { fetchOptions: { throw: true } },
				disableTestUser: true,
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

			const fetchHandler = async () =>
				client.$fetch(path, {
					...(endpoint.payload && {
						body: JSON.stringify(endpoint.payload),
					}),
					headers,
					query: endpoint.query,
					method,
					params: endpoint.param,
					customFetchImpl,
				});

			const beforeAll = async () => {
				const res = await setup?.({
					api,
					cookieSetter,
					sessionSetter,
					...rest,
				});
				if (typeof res === "object" && "headers" in res && res.headers)
					headers = res.headers;
			};

			const beforeEach = async () => {
				const res = await before?.({
					api,
					cookieSetter,
					sessionSetter,
					...rest,
				});
				if (typeof res === "object" && "headers" in res && res.headers)
					headers = res.headers;
			};

			const afterEach = async () =>
				await after?.({
					api,
					cookieSetter,
					sessionSetter,
					...rest,
				});

			const afterAll = async () =>
				await teardown?.({
					api,
					cookieSetter,
					sessionSetter,
					...rest,
				});

			this.debugFns.push(async () => {
				await beforeAll();
				await beforeEach();

				console.log(name, await fetchHandler());

				await afterEach();
				await afterAll();
			});

			this.add(name, fetchHandler, {
				beforeAll,
				beforeEach,
				afterEach,
				afterAll,
			});
		}
	}

	protected getType() {
		return BenchType.REQ_SEC;
	}
	protected isDebug() {
		return this.options.debug === true;
	}
	protected isCI() {
		return this.options.ci === true;
	}

	static async create(debug?: boolean, ci?: boolean) {
		const benchmark = new RequestSecBenchmark({
			debug,
			ci,
			endpoints: [
				{
					name: "signUpEmail",
					method: "POST",
					path: "/sign-up/email",
					payload: BenchUtils.testUser,
					after: BenchUtils.cleanupTestUser,
				},
				{
					name: "signInEmail",
					method: "POST",
					path: "/sign-in/email",
					payload: BenchUtils.testUser,
					before: async (ctx) =>
						void (await ctx.api.signUpEmail({ body: BenchUtils.testUser })),
					after: BenchUtils.cleanupTestUser,
				},
				{
					name: "getSession",
					method: "GET",
					path: "/get-session",
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "listSessions",
					method: "GET",
					path: "/list-sessions",
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "sendVerificationEmail",
					method: "POST",
					path: "/send-verification-email",
					payload: { email: BenchUtils.testUser.email },
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "updateUser",
					method: "POST",
					path: "/update-user",
					payload: {
						name: "Benchmark Updated Name",
						image: "https://example.com/benchmark-image.jpg",
					},
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "changePassword",
					method: "POST",
					path: "/change-password",
					payload: {
						newPassword: "benchmarkNewPassword123",
						currentPassword: BenchUtils.testUser.password,
						revokeOtherSessions: false,
					},
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "listUserAccounts",
					method: "GET",
					path: "/list-accounts",
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "signOut",
					method: "POST",
					path: "/sign-out",
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "deleteUser",
					method: "POST",
					path: "/delete-user",
					payload: {
						password: BenchUtils.testUser.password,
					},
					setup: BenchUtils.setupAuthenticatedUser,
					teardown: BenchUtils.cleanupTestUser,
				},
				{
					name: "ok",
					method: "GET",
					path: "/ok",
				},
				{
					name: "error",
					method: "GET",
					path: "/error",
				},
			],
			authOpts: { user: { deleteUser: { enabled: true } } },
		});
		await benchmark.setup();
		return benchmark.execute();
	}
}

ColdStartBenchmark.create(false, isCI);
await RequestSecBenchmark.create(false, isCI);
