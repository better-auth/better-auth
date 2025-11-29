import { describe, expect, it } from "vitest";
import { formatCode } from ".";
import { getDatabaseCode } from "./database";

describe("init CLI - database generation", () => {
	describe("prisma", () => {
		it("should generate the right prisma-sqlite database code", async () => {
			const database = getDatabaseCode("prisma-sqlite");
			const expectedCode = await formatCode(
				`prismaAdapter(client, { provider: 'sqlite' })`,
			);
			const code = await formatCode(database.code({}));
			expect(code).toEqual(expectedCode);

			const expectedPreCode = await formatCode(
				"const client = new PrismaClient();",
			);
			const preCode = await formatCode(database.preCode ?? "");
			expect(preCode).toEqual(expectedPreCode);
		});

		it("should generate the right prisma-mysql database code", async () => {
			const database = getDatabaseCode("prisma-mysql");
			const expectedCode = await formatCode(
				`prismaAdapter(client, { provider: 'mysql' })`,
			);
			const code = await formatCode(database.code({}));
			expect(code).toEqual(expectedCode);

			const expectedPreCode = await formatCode(
				"const client = new PrismaClient();",
			);
			const preCode = await formatCode(database.preCode ?? "");
			expect(preCode).toEqual(expectedPreCode);
		});

		it("should generate the right prisma-postgresql database code", async () => {
			const database = getDatabaseCode("prisma-postgresql");
			const expectedCode = await formatCode(
				`prismaAdapter(client, { provider: 'postgresql' })`,
			);
			const code = await formatCode(database.code({}));
			expect(code).toEqual(expectedCode);

			const expectedPreCode = await formatCode(
				"const client = new PrismaClient();",
			);
			const preCode = await formatCode(database.preCode ?? "");
			expect(preCode).toEqual(expectedPreCode);
		});
	});

	describe("drizzle", () => {
		it("should generate the right drizzle-sqlite database code", async () => {
			const database = getDatabaseCode("drizzle-sqlite-better-sqlite3");
			const expectedCode = await formatCode(
				`drizzleAdapter(db, { provider: 'sqlite', schema })`,
			);
			const code = await formatCode(database.code({}));
			expect(code).toEqual(expectedCode);
		});

		it("should generate the right drizzle-mysql database code", async () => {
			const database = getDatabaseCode("drizzle-mysql");
			const expectedCode = await formatCode(
				`drizzleAdapter(db, { provider: 'mysql', schema })`,
			);
			const code = await formatCode(database.code({}));
			expect(code).toEqual(expectedCode);
		});

		it("should generate the right drizzle-postgresql database code", async () => {
			const database = getDatabaseCode("drizzle-postgresql");
			const expectedCode = await formatCode(
				`drizzleAdapter(db, { provider: 'postgresql', schema })`,
			);
			const code = await formatCode(database.code({}));
			expect(code).toEqual(expectedCode);
		});
	});

	describe("kysely", () => {
		it("should generate the right kysely-sqlite database code", async () => {
			const database = getDatabaseCode("sqlite-better-sqlite3");
			const expectedCode = (
				await formatCode(`const database = { dialect, type: 'sqlite' }`)
			).replace("const database = ", "");
			const code = (
				await formatCode(`const database = ` + database.code({}))
			).replace("const database = ", "");
			expect(code).toEqual(expectedCode);

			const expectedPreCode = await formatCode(
				`const dialect = new Database("database.sqlite")`,
			);
			const preCode = await formatCode(database.preCode ?? "");
			expect(preCode).toEqual(expectedPreCode);
		});

		it("should generate the right kysely-mysql database code", async () => {
			const database = getDatabaseCode("mysql");
			const expectedCode = (
				await formatCode(`const database = { dialect, type: 'mysql' }`)
			).replace("const database = ", "");
			const code = (
				await formatCode(`const database = ` + database.code({}))
			).replace("const database = ", "");
			expect(code).toEqual(expectedCode);

			const expectedPreCode = await formatCode(
				`const dialect = createPool({
                    host: 'localhost',
                    user: 'root',
                    password: 'password',
                    database: 'database',
                    timezone: 'Z',
                });`,
			);
			const preCode = await formatCode(database.preCode ?? "");
			expect(preCode).toEqual(expectedPreCode);
		});

		it("should generate the right kysely-postgresql database code", async () => {
			const database = getDatabaseCode("postgresql");
			const expectedCode = (
				await formatCode(`const database = { dialect, type: 'postgresql' }`)
			).replace("const database = ", "");
			const code = (
				await formatCode(`const database = ` + database.code({}))
			).replace("const database = ", "");
			expect(code).toEqual(expectedCode);

			const expectedPreCode = await formatCode(
				`const dialect = new Pool({
                    connectionString: 'postgresql://postgres:password@localhost:5432/database',
                });`,
			);
			const preCode = await formatCode(database.preCode ?? "");
			expect(preCode).toEqual(expectedPreCode);
		});

		it("should generate the right kysely-mssql database code", async () => {
			const database = getDatabaseCode("mssql");
			const expectedCode = (
				await formatCode(`const database = { dialect, type: 'mssql' }`)
			).replace("const database = ", "");
			const code = (
				await formatCode(`const database = ` + database.code({}))
			).replace("const database = ", "");
			expect(code).toEqual(expectedCode);

			const expectedPreCode = await formatCode(
				`const dialect = new MssqlDialect({
                    tarn: {
                        ...Tarn,
                        options: {
                            min: 0,
                            max: 10,
                        },
                    },
                    tedious: {
                        ...Tedious,
                        connectionFactory: () => new Tedious.Connection({
                            authentication: {
                                options: {
                                    password: 'password',
                                    userName: 'username',
                                },
                                type: 'default',
                            },
                            options: {
                                database: 'some_db',
                                port: 1433,
                                trustServerCertificate: true,
                            },
                            server: 'localhost',
                        }),
						TYPES: {
							...Tedious.TYPES,
							DateTime: Tedious.TYPES.DateTime2,
						},
                    },
                });`,
			);
			const preCode = await formatCode(database.preCode ?? "");
			expect(preCode).toEqual(expectedPreCode);
		});
	});

	describe("mongodb", () => {
		it("should generate the right mongodb database code", async () => {
			const database = getDatabaseCode("mongodb");
			const expectedCode = await formatCode(`mongodbAdapter(db)`);
			const code = await formatCode(database.code({}));
			expect(code).toEqual(expectedCode);

			const expectedPreCode = await formatCode(
				`const client = new MongoClient(process.env.DATABASE_URL);\nconst db = client.db();`,
			);
			const preCode = await formatCode(database.preCode ?? "");
			expect(preCode).toEqual(expectedPreCode);
		});
	});
});
