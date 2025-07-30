// Simple test to verify the transformOutput fix
import { createAdapter } from "./packages/better-auth/dist/adapters/index.mjs";

console.log("=== Testing transformOutput Fix ===\n");

// Mock schema with additional field
const mockSchema = {
  organization: {
    fields: {
      id: { type: "string" },
      name: { type: "string" },
      slug: { type: "string" },
      createdAt: { type: "date" },
      publicId: { 
        type: "string", 
        required: false, 
        returned: true,  // This should be included even if missing from DB
        input: false 
      }
    }
  }
};

// Mock database adapter config that doesn't return publicId field
const mockConfig = {
  provider: "mock",
  create: async () => ({}),
  findOne: async () => ({
    id: "org-123",
    name: "Test Organization", 
    slug: "test-org",
    createdAt: new Date()
    // Note: publicId is missing from database result
  }),
  findMany: async () => ([{
    id: "org-123",
    name: "Test Organization",
    slug: "test-org", 
    createdAt: new Date()
    // Note: publicId is missing from database result
  }]),
  update: async () => ({}),
  delete: async () => ({}),
  options: { provider: "mock" }
};

try {
  const adapter = createAdapter(mockConfig, {
    advanced: {},
    database: { provider: "mock" }
  });

  // Test the transformOutput function directly
  const testData = {
    id: "org-123",
    name: "Test Organization",
    slug: "test-org",
    createdAt: new Date()
    // publicId is missing
  };

  console.log("Input data (simulating database result):");
  console.log(JSON.stringify(testData, null, 2));
  console.log("\nTesting transformOutput with schema that includes publicId with returned: true...\n");

  // We need to manually test this since we can't easily access the internal transformOutput
  // Instead, let's test through the adapter methods
  const result = await adapter.findOne({
    model: "organization",
    where: { id: "org-123" }
  });

  console.log("Output after transformation:");
  console.log(JSON.stringify(result, null, 2));

  if (result && 'publicId' in result) {
    console.log("\n✅ SUCCESS: publicId field is present in the result");
    console.log("publicId value:", result.publicId);
  } else {
    console.log("\n❌ FAILURE: publicId field is missing from the result");
    console.log("Available fields:", result ? Object.keys(result) : "No result");
  }

} catch (error) {
  console.error("Error during test:", error);
}
