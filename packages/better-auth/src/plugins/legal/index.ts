// import type { BetterAuthPlugin, User } from "../../types";
import type { BetterAuthPlugin } from "../../../../core/src/types/plugin";
import type { User } from "../../../../core/src/db/index";
import { APIError } from "better-call";
import z, { ZodDate, ZodObject, ZodOptional } from "zod";
// import { createAuthEndpoint, createAuthMiddleware } from "../../api";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "../../../../core/src/middleware";
import { createFieldAttribute } from "../../db";
import { userSchema as coreUserSchema } from "@better-auth/core/db";
import { generateRandomString } from "../../crypto";

// url and text field are for future use
type LegalDocument = {
	// url: string;
	mustAccept?: boolean;
	mustView?: boolean;
	// text: string;
	name: string;
};

export type LegalOptions = {
	documents: LegalDocument[];
	/**
	 * @default true
	 */
	blockSignUp?: boolean;
	/**
	 * @default true
	 */
	blockSignIn?: boolean;
	/**
	 * @default "legal-id"
	 */
	cookieName?: string;
};

export type UserWithDocuments = User & {
	[K in `${string}AcceptedAt` | `${string}ViewedAt`]?: Date;
};

type LegalSchema = {
	user?: string;
	cookie?: string;

	name: string;
	viewedAt?: Date;
	acceptedAt?: Date;
};

export function legal({
	documents,
	blockSignUp = true,
	blockSignIn = true,
	cookieName = "legal-id",
}: LegalOptions) {
	const userSchema = (coreUserSchema as ZodObject).extend(
		(
			documents
				.map((f) => `${f.name}AcceptedAt`)
				.concat(documents.map((f) => `${f.name}ViewedAt`)) as string[]
		).reduce(
			(acc, key) => {
				return { ...acc, [key]: z.date().optional() };
			},
			{} as { [key: string]: ZodOptional<ZodDate> },
		),
	);
	return {
		id: "legal",
		init: async (context) => {
			return {
				options: {
					databaseHooks: {
						user: {
							create: {
								after: async (user, ctx) => {
									if (!ctx) throw new APIError("INTERNAL_SERVER_ERROR");

									const cookie = ctx.getCookie(cookieName);

									await ctx.context.adapter.updateMany({
										model: "requirement",
										where: [
											{
												field: "cookie",
												value: cookie,
											},
										],
										update: {
											user: user.id,
										},
									});
								},
							},
						},
					},
				},
			};
		},
		endpoints: {
			actionLegalDocument: createAuthEndpoint(
				"/legal/action",
				{
					method: "POST",
					body: z.object({
						name: z.enum(documents.map((f) => f.name)),
						acceptedAt: z.date().optional(),
						viewedAt: z.date().optional(),
					}),
				},
				async (ctx) => {
					if (!ctx.body.acceptedAt && !ctx.body.viewedAt) {
						throw new APIError("BAD_REQUEST", {
							message:
								"You must either accept or view the document when calling this endpoint",
						});
					}
					let cookie = ctx.getCookie(cookieName);
					if (!cookie) {
						cookie = generateRandomString(32, "a-z", "A-Z");
						ctx.setCookie("legal-id", cookie);
					}

					ctx.context.adapter.create<LegalSchema>({
						model: "requirement",
						data: {
							cookie,
							name: ctx.body.name,
							acceptedAt: ctx.body.acceptedAt,
							viewedAt: ctx.body.viewedAt,
						},
					});
				},
			),
			listDocuments: createAuthEndpoint(
				"/legal/list",
				{
					method: "GET",
				},
				async (ctx) => {
					if (!(ctx.context.session || ctx.getCookie(cookieName))) {
						throw new APIError("UNAUTHORIZED");
					}
					const data = await ctx.context.adapter.findMany<LegalSchema>({
						model: "requirement",
						where: [
							ctx.context.session
								? {
										field: "user",
										value: ctx.context.session.user.id,
									}
								: {
										field: "cookie",
										value: ctx.getCookie(cookieName),
									},
						],
					});
					return ctx.json({
						data,
					});
				},
			),
		},
		schema: {
			legal: {
				fields: {
					name: createFieldAttribute(documents.map((f) => f.name)),
					//Requires user or cookie
					user: createFieldAttribute("string", {
						required: false,
					}),
					cookie: createFieldAttribute("string", {
						required: false,
					}),

					viewedAt: createFieldAttribute("date", {
						required: false,
					}),
					acceptedAt: createFieldAttribute("date", {
						required: false,
					}),
				},
			},
		},
		hooks: {
			before: [
				{
					matcher: (ctx) =>
						((ctx.path.includes("/sign-up") ||
							ctx.path === "/sign-in/social") &&
							blockSignUp) ||
						(ctx.path.includes("/sign-in") && blockSignIn),
					handler: createAuthMiddleware(async (ctx) => {
						const cookie = ctx.getCookie(cookieName);
						const user = userSchema.parse(await ctx.request?.json());
						const data = await ctx.context.adapter.findMany<LegalSchema>({
							model: "legal",
							where: [
								...(ctx.context.session
									? [
											{
												field: "cookie",
												value: cookie,
												connector: "OR" as const,
											},
											{
												field: "userId",
												value: ctx.context.session.user.id,
												connector: "OR" as const,
											},
										]
									: [
											{
												field: "cookie",
												value: cookie,
											},
										]),
							],
						});
						documents.forEach((f) => {
							const document = data.find((d) => d.name === f.name);
							if (
								(f.mustAccept ?? true) &&
								!document?.acceptedAt &&
								!user[`${f.name}AcceptedAt`]
							) {
								throw new APIError("PRECONDITION_FAILED", {
									message: `You must accept the ${f.name} before signing up`,
								});
							}
							if (
								(f.mustView ?? true) &&
								!document?.viewedAt &&
								!user[`${f.name}ViewedAt`]
							) {
								throw new APIError("PRECONDITION_REQUIRED", {
									message: `You must read the ${f.name} before signing up`,
								});
							}

							return {
								name: f.name,
								viewedAt: document?.viewedAt,
								acceptedAt: document?.acceptedAt,
							};
						});

						const newDocs: Record<string, LegalSchema> = {};

						Object.entries(user).forEach(([key, value]) => {
							if (key.endsWith("AcceptedAt")) {
								const name = key.slice(0, -10);
								newDocs[name] = {
									...(name in documents ? newDocs[name] : {}),
									acceptedAt: value,
									name,
									cookie: cookie ?? undefined,
									user: ctx.context.session?.user.id,
								};
							} else if (key.endsWith("ViewedAt")) {
								const name = key.slice(0, -8);
								newDocs[name] = {
									...(name in documents ? newDocs[name] : {}),
									viewedAt: value,
									name,
									cookie: cookie ?? undefined,
									user: ctx.context.session?.user.id,
								};
							}
						});

						await ctx.context.adapter.transaction(async (trx) => {
							await Promise.all(
								Object.entries(newDocs).map(async ([name, doc]) => {
									await trx.create<LegalSchema>({
										model: "requirement",
										data: {
											...doc,
											name,
										},
									});
								}),
							);
						});
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
}
