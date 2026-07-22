import * as z from "zod";
import { auth } from "@/lib/auth";
import { getSCIMDemoBaseURL, isSCIMDemoEnabled } from "@/lib/scim-demo";
import {
	SCIM_DEMO_GROUP_KEYS,
	SCIM_DEMO_USER_KEYS,
} from "@/lib/scim-demo-catalog";
import type { SCIMDemoAction } from "@/lib/scim-demo-contract";
import {
	applySCIMDemoAction,
	assertSCIMDemoOperatorAccess,
	getSCIMDemoCompletedOperations,
	getSCIMDemoError,
	getSCIMDemoWorkspace,
} from "@/lib/scim-demo-service";

export const runtime = "nodejs";

const userKeySchema = z.enum(SCIM_DEMO_USER_KEYS);
const groupKeySchema = z.enum(SCIM_DEMO_GROUP_KEYS);
const actionSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("provision-user"), userKey: userKeySchema }),
	z.object({
		type: z.literal("update-profile"),
		userKey: userKeySchema,
		displayName: z.string().trim().min(2).max(80),
	}),
	z.object({
		type: z.literal("set-groups"),
		userKey: userKeySchema,
		groupKeys: z.array(groupKeySchema).max(3),
	}),
	z.object({
		type: z.literal("set-active"),
		userKey: userKeySchema,
		active: z.boolean(),
	}),
	z.object({ type: z.literal("delete-user"), userKey: userKeySchema }),
	z.object({ type: z.literal("reset-sandbox") }),
]);

function jsonError(message: string, status: number) {
	return Response.json(
		{ error: message },
		{
			status,
			headers: { "cache-control": "no-store" },
		},
	);
}

function getServiceContext(baseURL: string, operatorId: string) {
	return auth.$context.then((context) => ({
		baseURL,
		database: context.adapter,
		operatorId,
		userGraph: context.internalAdapter,
	}));
}

export async function GET(request: Request) {
	if (!isSCIMDemoEnabled()) return jsonError("SCIM demo not found", 404);

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) return jsonError("Authentication required", 401);

	try {
		const context = await getServiceContext(
			getSCIMDemoBaseURL(),
			session.user.id,
		);
		await assertSCIMDemoOperatorAccess(context.database, session.user.id);
		const workspace = await getSCIMDemoWorkspace(context);
		return Response.json(workspace, {
			headers: { "cache-control": "no-store" },
		});
	} catch (error) {
		const failure = getSCIMDemoError(error);
		return jsonError(failure.message, failure.status);
	}
}

export async function POST(request: Request) {
	if (!isSCIMDemoEnabled()) return jsonError("SCIM demo not found", 404);

	const baseURL = getSCIMDemoBaseURL();
	const origin = request.headers.get("origin");
	if (origin !== new URL(baseURL).origin) {
		return jsonError("Cross-origin SCIM demo requests are not allowed", 403);
	}

	const session = await auth.api.getSession({ headers: request.headers });
	if (!session) return jsonError("Authentication required", 401);
	const context = await getServiceContext(baseURL, session.user.id);
	try {
		await assertSCIMDemoOperatorAccess(context.database, session.user.id);
	} catch (error) {
		const failure = getSCIMDemoError(error);
		return jsonError(failure.message, failure.status);
	}

	const body: unknown = await request.json().catch(() => undefined);
	const parsedAction = actionSchema.safeParse(body);
	if (!parsedAction.success) {
		return jsonError("Invalid SCIM demo action", 400);
	}

	try {
		const action: SCIMDemoAction = parsedAction.data;
		const result = await applySCIMDemoAction(context, action);
		return Response.json(result, {
			headers: { "cache-control": "no-store" },
		});
	} catch (error) {
		const failure = getSCIMDemoError(error);
		const operations = getSCIMDemoCompletedOperations(error);
		if (operations.length === 0) {
			return jsonError(failure.message, failure.status);
		}
		try {
			const workspace = await getSCIMDemoWorkspace(context);
			return Response.json(
				{ error: failure.message, operations, workspace },
				{
					status: failure.status,
					headers: { "cache-control": "no-store" },
				},
			);
		} catch {
			return jsonError(failure.message, failure.status);
		}
	}
}
