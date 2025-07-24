import { describe, expectTypeOf } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { organization, twoFactor } from "../plugins";

describe("general types", async (it) => {
	it("should infer base session", async () => {
		const { auth } = await getTestInstance();
		expectTypeOf(auth.$Infer.Session).toEqualTypeOf<{
			session: {
				id: string;
				userId: string;
				token: string;
				createdAt: Date;
				updatedAt: Date;
				expiresAt: Date;
				ipAddress?: string | undefined | null;
				userAgent?: string | undefined | null;
			};
			user: {
				id: string;
				email: string;
				emailVerified: boolean;
				name: string;
				image?: string | undefined | null;
				createdAt: Date;
				updatedAt: Date;
			};
		}>();
	});

	it("should infer additional fields from plugins", async () => {
		const { auth } = await getTestInstance({
			plugins: [twoFactor(), organization()],
		});
		expectTypeOf<typeof auth.$Infer.Session.user>().toEqualTypeOf<{
			id: string;
			email: string;
			emailVerified: boolean;
			name: string;
			image?: string | undefined | null;
			createdAt: Date;
			updatedAt: Date;
			twoFactorEnabled: boolean | undefined | null;
		}>();

		expectTypeOf<typeof auth.$Infer.Session.session>().toEqualTypeOf<{
			id: string;
			userId: string;
			expiresAt: Date;
			createdAt: Date;
			updatedAt: Date;
			token: string;
			ipAddress?: string | undefined | null;
			userAgent?: string | undefined | null;
			activeOrganizationId?: string | undefined | null;
		}>();
	});
});
