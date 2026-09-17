import * as z from "zod";
import { isSCIMDemoEmployeePortalEnabled } from "@/lib/scim-demo";
import { createSCIMDemoEmployeeAccessGrant } from "@/lib/scim-demo-employee";
import {
	assertSCIMDemoOrganizationContext,
	authorizeSCIMDemoManagementRequest,
	createSCIMDemoManagementError,
	SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
	scimDemoManagementErrorResponse,
} from "@/lib/scim-demo-management";

export const runtime = "nodejs";

const requestSchema = z
	.object({
		organizationId: z.string().min(1).max(200),
		scimUserId: z.string().min(1).max(255),
	})
	.strict();

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ organizationId: string }> },
) {
	const organizationId = (await params).organizationId;
	try {
		if (!isSCIMDemoEmployeePortalEnabled()) {
			throw createSCIMDemoManagementError(404, "SCIM demo not found");
		}
		const { context } = await authorizeSCIMDemoManagementRequest(
			request,
			organizationId,
			{ mutation: true },
		);
		const body: unknown = await request.json().catch(() => undefined);
		const parsed = requestSchema.safeParse(body);
		if (!parsed.success) {
			throw createSCIMDemoManagementError(
				400,
				"The employee-link context did not match the request path",
			);
		}
		assertSCIMDemoOrganizationContext(
			parsed.data.organizationId,
			organizationId,
		);
		const grant = await createSCIMDemoEmployeeAccessGrant(
			context.adapter,
			context.internalAdapter,
			parsed.data,
		);
		if (!grant) {
			throw createSCIMDemoManagementError(
				404,
				"The employee access link is unavailable",
			);
		}
		return Response.json(grant, {
			status: 201,
			headers: SCIM_DEMO_MANAGEMENT_RESPONSE_HEADERS,
		});
	} catch (error) {
		return scimDemoManagementErrorResponse(error);
	}
}
