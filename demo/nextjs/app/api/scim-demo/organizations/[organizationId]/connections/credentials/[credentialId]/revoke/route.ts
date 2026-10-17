import * as z from "zod";
import { auth } from "@/lib/auth";
import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import {
	assertSCIMDemoCredentialContext,
	authorizeSCIMDemoManagementRequest,
	createSCIMDemoConnectionResponse,
	createSCIMDemoManagementError,
	loadSCIMDemoManagedState,
	SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
	scimDemoManagementErrorResponse,
} from "@/lib/scim-demo-management";

export const runtime = "nodejs";

const requestSchema = z
	.object({
		organizationId: z.string().min(1).max(200),
		credentialId: z.string().min(1).max(255),
	})
	.strict();

export async function POST(
	request: Request,
	{
		params,
	}: {
		params: Promise<{ organizationId: string; credentialId: string }>;
	},
) {
	const { organizationId, credentialId } = await params;
	try {
		if (!isSCIMDemoEnabled()) {
			throw createSCIMDemoManagementError(404, "SCIM demo not found");
		}
		const { context, session } = await authorizeSCIMDemoManagementRequest(
			request,
			organizationId,
			{ mutation: true },
		);
		const body: unknown = await request.json().catch(() => undefined);
		const parsed = requestSchema.safeParse(body);
		if (!parsed.success) {
			throw createSCIMDemoManagementError(
				400,
				"The credential context did not match the request path",
			);
		}
		assertSCIMDemoCredentialContext(parsed.data, {
			organizationId,
			credentialId,
		});
		const current = await loadSCIMDemoManagedState(organizationId);
		if (!current) {
			throw createSCIMDemoManagementError(
				404,
				"The requested SCIM credential was not found",
			);
		}
		await auth.api.revokeSCIMManagedCredential({
			body: {
				connectionId: current.connection.connectionId,
				provisioningDomainId: current.connection.provisioningDomainId,
				credentialId,
				actorId: session.user.id,
			},
		});
		const refreshed = await loadSCIMDemoManagedState(organizationId);
		if (!refreshed) {
			throw createSCIMDemoManagementError(
				500,
				"The SCIM connection disappeared after credential revocation",
			);
		}
		const state = await createSCIMDemoConnectionResponse(
			context.adapter,
			refreshed,
		);
		return Response.json(state, {
			headers: SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
		});
	} catch (error) {
		return scimDemoManagementErrorResponse(error);
	}
}
