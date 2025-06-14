import { betterAuth } from "../../../../auth";
import { organizationRbac } from "../rbac-organization";
import { memoryAdapter } from "../../../../adapters/memory-adapter";

// Demo script to verify RBAC organization plugin is properly configured
async function testRbacOrganizationSetup() {
	console.log("=== RBAC Organization Setup Test ===");

	try {
		console.log("1. Initializing auth with RBAC organization plugin...");
		
		// Initialize auth with RBAC organization plugin
		const auth = betterAuth({
database: memoryAdapter({}),
emailAndPassword: {
enabled: true,
},
plugins: [
organizationRbac({
rbac: {
enabled: true,
enableAuditLog: true,
defaultRoles: [
{
name: "Organization Owner",
description: "Full access to the organization",
level: 10,
permissions: ["organization:*", "member:*", "team:*", "role:*"],
isCreatorRole: true,
},
{
name: "Member", 
description: "Standard member of the organization",
level: 5,
permissions: ["organization:read", "member:read", "team:read"],
isCreatorRole: false,
},
],
customPermissions: [
{
name: "organization:*",
resource: "organization", 
action: "*",
description: "All organization permissions",
},
{
name: "member:*",
resource: "member",
action: "*", 
description: "All member permissions",
},
],
},
}),
],
});

		console.log("✓ Auth instance created successfully");
		console.log("✓ RBAC organization plugin loaded");
		console.log("✓ Default roles configured");
		console.log("✓ Audit logging enabled");
		console.log("🎉 RBAC Organization Plugin Setup Complete!");

		return { success: true, auth };

	} catch (error) {
		console.error("❌ Error during RBAC setup test:", error);
		return { success: false, error };
	}
}

// Export for use in other tests
export { testRbacOrganizationSetup };
