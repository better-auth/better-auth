import { Auth } from "better-auth";
import { socialProviderList } from "better-auth/social-providers";
import { Pool } from "pg";
import { auth } from "./auth";
import { User as SupabaseUser } from "@supabase/supabase-js";

type User = SupabaseUser & {
	is_super_admin: boolean;
	raw_user_meta_data: {
		avatar_url: string;
	};
	encrypted_password: string;
	email_confirmed_at: string;
	created_at: string;
	updated_at: string;
	is_anonymous: boolean;
	identities: {
		provider: string;
		identity_data: {
			sub: string;
			email: string;
		};
		created_at: string;
		updated_at: string;
	};
};

const migrateFromSupabase = async (
	auth: {
		$context: Auth["$context"];
	},
	config?: {
		getName: (user: User) => Promise<string> | string;
		additionalSocialProvider?: string[];
	},
) => {
	const ctx = await auth.$context;
	const db = ctx.options.database as Pool;
	if (!(db instanceof Pool)) {
		throw new Error("You must use `pg` adapter to migrate from Supabase");
	}
	const users = await db
		.query(`
			SELECT 
				u.*,
				COALESCE(
					json_agg(
						i.* ORDER BY i.id
					) FILTER (WHERE i.id IS NOT NULL),
					'[]'::json
				) as identities
			FROM auth.users u
			LEFT JOIN auth.identities i ON u.id = i.user_id
			GROUP BY u.id
		`)
		.then((res) => res.rows as User[]);
	for (const user of users) {
		if (!user.email) {
			continue;
		}
		await ctx.adapter
			.create({
				model: "user",
				data: {
					id: user.id,
					email: user.email,
					name: config?.getName ? await config.getName(user) : user.email,
					role: user.is_super_admin ? "admin" : user.role,
					emailVerified: !!user.email_confirmed_at,
					image: user.raw_user_meta_data.avatar_url,
					createdAt: new Date(user.created_at),
					updatedAt: new Date(user.updated_at),
					isAnonymous: user.is_anonymous,
				},
			})
			.catch(() => {});
		for (const identity of user.identities) {
			const existingAccounts = await ctx.internalAdapter.findAccounts(user.id);

			if (identity.provider === "email") {
				const hasCredential = existingAccounts.find(
					(account) => account.providerId === "credential",
				);
				if (!hasCredential) {
					await ctx.adapter
						.create({
							model: "account",
							data: {
								userId: user.id,
								providerId: "credential",
								accountId: user.id,
								password: user.encrypted_password,
								createdAt: new Date(user.created_at),
								updatedAt: new Date(user.updated_at),
							},
						})
						.catch(() => {});
				}
			}
			const supportedProviders: string[] = [
				...socialProviderList,
				...(config?.additionalSocialProvider || []),
			];
			if (supportedProviders.includes(identity.provider)) {
				const hasAccount = existingAccounts.find(
					(account) => account.providerId === identity.provider,
				);
				if (!hasAccount) {
					await ctx.adapter.create({
						model: "account",
						data: {
							userId: user.id,
							providerId: identity.provider,
							accountId: identity.identity_data?.sub,
							createdAt: new Date(identity.created_at ?? user.created_at),
							updatedAt: new Date(identity.updated_at ?? user.updated_at),
						},
					});
				}
			}
		}
	}
};

migrateFromSupabase(auth);
