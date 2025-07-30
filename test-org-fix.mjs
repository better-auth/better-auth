// Test script to verify fix for issue #3686 - organization additional fields not returned
import { betterAuth } from "./packages/better-auth/dist/index.mjs";
import { organization } from "./packages/better-auth/dist/plugins/organization/index.mjs";

// Mock adapter that simulates a database without the additional field
const mockAdapter = {
  findMany: async (model, where) => {
    console.log(`Querying ${model} with:`, where);
    if (model === "organization") {
      // Simulate database result without publicId field
      return [
        {
          id: "org-123",
          name: "Test Organization",
          slug: "test-org",
          createdAt: new Date(),
          // Note: publicId field is missing from database result
        }
      ];
    }
    return [];
  },

  findUnique: async (model, where) => {
    console.log(`Finding unique ${model} with:`, where);
    if (model === "organization") {
      return {
        id: "org-123",
        name: "Test Organization",
        slug: "test-org",
        createdAt: new Date(),
        // Note: publicId field is missing from database result
      };
    }
    return null;
  },

  create: async () => ({}),
  update: async () => ({}),
  delete: async () => ({}),
  options: {
    provider: "mock"
  }
};

// Initialize better-auth with organization plugin and additional fields
const auth = betterAuth({
  plugins: [
    organization({
      additionalFields: {
        publicId: {
          type: "string",
          required: false,
          returned: true,  // This should ensure the field is included in output
          input: false,
        }
      }
    })
  ],
  adapter: mockAdapter,
  database: {
    provider: "mock"
  }
});

async function testOrganizationFields() {
  try {
    console.log("\n=== Testing Organization Additional Fields Fix ===\n");
    
    // Test the adapter transformation directly
    console.log("Testing adapter.organization.listOrganizations...");
    const orgList = await auth.api.getInternalAdapter().organization.listOrganizations({
      userId: "user-123"
    });
    
    console.log("Organization list result:", JSON.stringify(orgList, null, 2));
    
    // Check if publicId field is present
    if (orgList && orgList.length > 0) {
      const firstOrg = orgList[0];
      if ('publicId' in firstOrg) {
        console.log("✅ SUCCESS: publicId field is present in the result");
        console.log("publicId value:", firstOrg.publicId);
      } else {
        console.log("❌ FAILURE: publicId field is missing from the result");
        console.log("Available fields:", Object.keys(firstOrg));
      }
    } else {
      console.log("No organizations returned");
    }

  } catch (error) {
    console.error("Error during test:", error);
  }
}

testOrganizationFields();
