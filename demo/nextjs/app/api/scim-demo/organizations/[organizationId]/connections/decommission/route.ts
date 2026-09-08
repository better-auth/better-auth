import * as z from "zod";
import { auth } from "@/lib/auth";
import { isSCIMDemoEnabled } from "@/lib/scim-demo";
import {
	assertSCIMDemoOrganizationContext,
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
	})
	.strict();

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ organizationId: string }> },
) {
	const organizationId = (await params).organizationId;
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
				"The organization context did not match the request path",
			);
		}
		assertSCIMDemoOrganizationContext(
			parsed.data.organizationId,
			organizationId,
		);
		const current = await loadSCIMDemoManagedState(organizationId);
		if (!current) {
			throw createSCIMDemoManagementError(
				404,
				"This organization does not have a SCIM connection",
			);
		}
		const result = await auth.api.decommissionSCIMManagedConnection({
			body: {
				connectionId: current.connection.connectionId,
				provisioningDomainId: current.connection.provisioningDomainId,
				actorId: session.user.id,
			},
		});
		const refreshed = await loadSCIMDemoManagedState(organizationId);
		if (!refreshed) {
			throw createSCIMDemoManagementError(
				500,
				"The SCIM connection disappeared during decommissioning",
			);
		}
		const response = await createSCIMDemoConnectionResponse(
			context.adapter,
			refreshed,
		);
		return Response.json(response, {
			status: result.decommission.status === "complete" ? 200 : 202,
			headers: SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
		});
	} catch (error) {
		return scimDemoManagementErrorResponse(error);
	}
}
