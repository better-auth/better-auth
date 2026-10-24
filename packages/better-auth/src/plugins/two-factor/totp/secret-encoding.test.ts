import { DatabaseSync } from "node:sqlite";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { symmetricDecrypt, symmetricEncrypt } from "../../../crypto";
import { getMigrations } from "../../../db/get-migration";
import { convertSetCookieToCookie } from "../../../test-utils/headers";
import { getTestInstance } from "../../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../../utils/constants";
import { twoFactor } from "..";
import type { TwoFactorTable } from "../types";

/** @see https://github.com/better-auth/better-auth/issues/9944 */
describe("TOTP secret encoding", () => {
	// Raw key: 809fff0123456789abcdef00102030405060708090.
	// Codes computed independently with Python's hmac/hashlib at 1234567890 seconds.
	const secret = "QCP76AJDIVTYTK6N54ABAIBQIBIGA4EASA";
	const rawCode = "716950";
	const utf8Code = "300119";

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(1_234_567_890_000);
	});
	afterEach(() => vi.useRealTimers());

	it("adds a nullable encoding column without changing existing secrets", async () => {
		const database = new DatabaseSync(":memory:");
		try {
			database.exec(`CREATE TABLE "twoFactor" (
				"id" text primary key not null,
				"secret" text not null,
				"backupCodes" text not null,
				"userId" text not null,
				"verified" integer default 1,
				"failedVerificationCount" integer default 0,
				"lockedUntil" date
			)`);
			const encrypted = await symmetricEncrypt({
				key: DEFAULT_SECRET,
				data: secret,
			});
			database
				.prepare(
					'INSERT INTO "twoFactor" ("id", "secret", "backupCodes", "userId") VALUES (?, ?, ?, ?)',
				)
				.run("legacy", encrypted, "[]", "user");
			const { toBeAdded, runMigrations } = await getMigrations({
				database,
				plugins: [twoFactor()],
			});
			expect(
				Object.keys(
					toBeAdded.find((table) => table.table === "twoFactor")!.fields,
				),
			).toEqual(["secretEncoding"]);
			await runMigrations();
			expect(
				database
					.prepare(
						'SELECT "secret", "secretEncoding" FROM "twoFactor" WHERE "id" = ?',
					)
					.get("legacy"),
			).toEqual({ secret: encrypted, secretEncoding: null });
		} finally {
			database.close();
		}
	});

	it.each([
		{ secretEncoding: undefined, skipVerificationOnEnable: false },
		{ secretEncoding: "utf8", skipVerificationOnEnable: false },
		{ secretEncoding: "base32", skipVerificationOnEnable: false },
		{ secretEncoding: "base32", skipVerificationOnEnable: true },
	] as const)(
		"uses $secretEncoding for new enrollments (skip verification: $skipVerificationOnEnable)",
		async ({ secretEncoding, skipVerificationOnEnable }) => {
			const { auth, db, testUser, signInWithTestUser } = await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [
					twoFactor({
						totpOptions: { secretEncoding, digits: 8, period: 60 },
						skipVerificationOnEnable,
					}),
				],
			});
			const { headers, user } = await signInWithTestUser();
			const { response: enrollment, headers: enrollmentHeaders } =
				await auth.api.enableTwoFactor({
					headers,
					body: { password: testUser.password },
					returnHeaders: true,
				});
			if (enrollment.method !== "totp")
				throw new Error("Expected TOTP enrollment");
			const row = await db.findOne<TwoFactorTable>({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			});
			expect(row).toMatchObject({
				secretEncoding: secretEncoding ?? "utf8",
				verified: skipVerificationOnEnable,
			});
			const storedSecret = await symmetricDecrypt({
				key: DEFAULT_SECRET,
				data: row!.secret,
			});
			const params = new URL(enrollment.totpURI).searchParams;
			expect(params.get("secret")).toBe(
				secretEncoding === "base32"
					? storedSecret
					: base32.encode(storedSecret, { padding: false }),
			);
			expect(params.get("digits")).toBe("8");
			expect(params.get("period")).toBe("60");
			const key = base32.decode(params.get("secret")!);
			const code = await createOTP(key, { digits: 8, period: 60 }).totp();
			const sessionHeaders = skipVerificationOnEnable
				? convertSetCookieToCookie(enrollmentHeaders)
				: headers;
			expect(
				await auth.api.getTOTPURI({
					headers: sessionHeaders,
					body: { password: testUser.password },
				}),
			).toEqual({ totpURI: enrollment.totpURI });
			if (!skipVerificationOnEnable) {
				const verified = await auth.api.verifyTOTP({
					headers,
					body: { code },
					asResponse: true,
				});
				expect(verified.status).toBe(200);
			}
			const challenge = await auth.api.signInEmail({
				body: { email: testUser.email, password: testUser.password },
				asResponse: true,
			});
			expect(await challenge.json()).toMatchObject({ twoFactorRedirect: true });
			const verified = await auth.api.verifyTOTP({
				headers: convertSetCookieToCookie(challenge.headers),
				body: { code },
				asResponse: true,
			});
			expect(verified.status).toBe(200);
			expect(
				await auth.api.getSession({
					headers: convertSetCookieToCookie(verified.headers),
				}),
			).toMatchObject({ user: { id: user.id, twoFactorEnabled: true } });
		},
	);

	it("uses stored encodings when new enrollments default to Base32", async () => {
		const { auth, db, testUser, signInWithUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor({ totpOptions: { secretEncoding: "base32" } })],
		});
		const cases = [
			{ secretEncoding: undefined, stored: secret, code: utf8Code },
			{ secretEncoding: null, stored: secret, code: utf8Code },
			{ secretEncoding: "utf8", stored: secret, code: utf8Code },
			{ secretEncoding: "base32", stored: secret, code: rawCode },
			{
				secretEncoding: "base32",
				stored: `${secret.toLowerCase()}======`,
				code: rawCode,
			},
		] as const;
		for (const [index, { secretEncoding, stored, code }] of cases.entries()) {
			const email = `encoding-${index}@example.com`;
			const { user } = await auth.api.signUpEmail({
				body: { email, name: "Test User", password: testUser.password },
			});
			const { headers } = await signInWithUser(email, testUser.password);
			await db.create({
				model: "twoFactor",
				data: {
					userId: user.id,
					secret: await symmetricEncrypt({ key: DEFAULT_SECRET, data: stored }),
					...(secretEncoding === undefined ? {} : { secretEncoding }),
					backupCodes: "[]",
					verified: true,
				},
			});
			await db.update({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: { twoFactorEnabled: true },
			});
			const { totpURI } = await auth.api.getTOTPURI({
				headers,
				body: { password: testUser.password },
			});
			expect(new URL(totpURI).searchParams.get("secret")).toBe(
				secretEncoding === "base32"
					? secret
					: base32.encode(secret, { padding: false }),
			);
			const challenge = await auth.api.signInEmail({
				body: { email, password: testUser.password },
				asResponse: true,
			});
			expect(await challenge.json()).toMatchObject({ twoFactorRedirect: true });
			const challengeHeaders = convertSetCookieToCookie(challenge.headers);
			// Request fields cannot override the format stored on the enrollment.
			const wrongEncoding = {
				code: code === rawCode ? utf8Code : rawCode,
				secretEncoding: secretEncoding === "base32" ? "utf8" : "base32",
			};
			const rejected = await auth.api.verifyTOTP({
				headers: challengeHeaders,
				body: wrongEncoding,
				asResponse: true,
			});
			expect(rejected.status).toBe(401);
			expect(await rejected.json()).toMatchObject({ code: "INVALID_CODE" });
			const verified = await auth.api.verifyTOTP({
				headers: challengeHeaders,
				body: { code },
				asResponse: true,
			});
			expect(verified.status).toBe(200);
			expect(
				await auth.api.getSession({
					headers: convertSetCookieToCookie(verified.headers),
				}),
			).toMatchObject({ user: { id: user.id } });
		}
	});

	it("enrolls a Base32 secret using the configured digits and period", async () => {
		const { auth, db, testUser, signInWithTestUser } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor({ totpOptions: { digits: 8, period: 60 } })],
		});
		const { headers, user } = await signInWithTestUser();
		await db.create({
			model: "twoFactor",
			data: {
				userId: user.id,
				secret: await symmetricEncrypt({ key: DEFAULT_SECRET, data: secret }),
				secretEncoding: "base32",
				backupCodes: "[]",
				verified: false,
			},
		});
		const { totpURI } = await auth.api.getTOTPURI({
			headers,
			body: { password: testUser.password },
		});
		const params = new URL(totpURI).searchParams;
		expect(params.get("secret")).toBe(secret);
		expect(params.get("digits")).toBe("8");
		expect(params.get("period")).toBe("60");
		expect(
			await auth.api.generateTOTP({
				body: { secret, secretEncoding: "base32" },
			}),
		).toEqual({ code: "14437248" });
		const verified = await auth.api.verifyTOTP({
			headers,
			body: { code: "14437248" },
			asResponse: true,
		});
		expect(verified.status).toBe(200);
		expect(
			await auth.api.getSession({
				headers: convertSetCookieToCookie(verified.headers),
			}),
		).toMatchObject({ user: { twoFactorEnabled: true } });
		expect(
			await db.findOne({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			}),
		).toMatchObject({ verified: true, secretEncoding: "base32" });
	});

	it("generates codes independently of the new enrollment encoding", async () => {
		const { auth } = await getTestInstance({
			plugins: [twoFactor({ totpOptions: { secretEncoding: "base32" } })],
		});
		for (const secretEncoding of [undefined, null, "utf8", "base32"] as const) {
			expect(
				await auth.api.generateTOTP({
					body: { secret, secretEncoding },
				}),
			).toEqual({ code: secretEncoding === "base32" ? rawCode : utf8Code });
		}
		await expect(
			auth.api.generateTOTP({
				body: { secret: "invalid!", secretEncoding: "base32" },
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_CODE" } });
	});

	it.each(["utf8", "base32"] as const)(
		"uses %s when replacing an unverified enrollment",
		async (secretEncoding) => {
			const { auth, db, testUser, signInWithTestUser } = await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [twoFactor({ totpOptions: { secretEncoding } })],
			});
			const { headers, user } = await signInWithTestUser();
			await db.create({
				model: "twoFactor",
				data: {
					userId: user.id,
					secret: await symmetricEncrypt({ key: DEFAULT_SECRET, data: secret }),
					secretEncoding: secretEncoding === "base32" ? "utf8" : "base32",
					backupCodes: "[]",
					verified: false,
				},
			});
			const enrollment = await auth.api.enableTwoFactor({
				headers,
				body: { password: testUser.password },
			});
			if (enrollment.method !== "totp")
				throw new Error("Expected TOTP enrollment");
			const row = await db.findOne<TwoFactorTable>({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			});
			expect(row).toMatchObject({ secretEncoding, verified: false });
			const { totpURI } = await auth.api.getTOTPURI({
				headers,
				body: { password: testUser.password },
			});
			expect(totpURI).toBe(enrollment.totpURI);
			const key = base32.decode(new URL(totpURI).searchParams.get("secret")!);
			const verified = await auth.api.verifyTOTP({
				headers,
				body: { code: await createOTP(key).totp() },
				asResponse: true,
			});
			expect(verified.status).toBe(200);
		},
	);

	it.each([
		{ secretEncoding: "base32", stored: "invalid!" },
		{ secretEncoding: "base32", stored: "" },
		{ secretEncoding: "base32", stored: "A" },
		{ secretEncoding: "base32", stored: "MZ" },
		{ secretEncoding: "base32", stored: `${secret}=trailing-data` },
		{ secretEncoding: "base32", stored: `${secret}=` },
		{ secretEncoding: "base32", stored: `${secret}=======` },
		{ secretEncoding: "unknown", stored: secret },
	])(
		"rejects invalid stored secrets ($secretEncoding, $stored)",
		async ({ secretEncoding, stored }) => {
			const { auth, db, testUser, signInWithTestUser } = await getTestInstance({
				secret: DEFAULT_SECRET,
				plugins: [twoFactor()],
			});
			const { headers, user } = await signInWithTestUser();
			await db.create({
				model: "twoFactor",
				data: {
					userId: user.id,
					secret: await symmetricEncrypt({ key: DEFAULT_SECRET, data: stored }),
					secretEncoding,
					backupCodes: "[]",
					verified: true,
				},
			});
			await db.update({
				model: "user",
				where: [{ field: "id", value: user.id }],
				update: { twoFactorEnabled: true },
			});
			await expect(
				auth.api.getTOTPURI({
					headers,
					body: { password: testUser.password },
				}),
			).rejects.toMatchObject({ body: { code: "INVALID_CODE" } });
			const challenge = await auth.api.signInEmail({
				body: { email: testUser.email, password: testUser.password },
				asResponse: true,
			});
			const rejected = await auth.api.verifyTOTP({
				headers: convertSetCookieToCookie(challenge.headers),
				body: { code: utf8Code },
				asResponse: true,
			});
			expect(rejected.status).toBe(401);
			expect(await rejected.json()).toMatchObject({ code: "INVALID_CODE" });
			expect(
				await db.findOne({
					model: "twoFactor",
					where: [{ field: "userId", value: user.id }],
				}),
			).toMatchObject({ failedVerificationCount: 1 });
		},
	);
});
