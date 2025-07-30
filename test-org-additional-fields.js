// Test script to reproduce the organization additional fields issue
const { betterAuth } = require("./packages/better-auth/dist/index.js");
const { organization } = require("./packages/better-auth/dist/plugins/organization/index.js");

async function testOrganizationAdditionalFields() {
  // Mock database adapter to simulate the issue
  const mockAdapter = {
    create: async (data) => {
      console.log("Creating:", data);
      return { id: "test-id", ...data.data };
    },
    findOne: async (query) => {
      console.log("Finding one:", query);
      // Simulate organization without additional fields
      return {
        id: "org-id",
        name: "Test Org",
        slug: "test-org",
        createdAt: new Date(),
        // publicId is missing from the database result
      };
    },
    findMany: async (query) => {
      console.log("Finding many:", query);
      return [{
        id: "org-id",
        name: "Test Org",
        slug: "test-org",
        createdAt: new Date(),
        // publicId is missing from the database result
      }];
    }
  };

  const auth = betterAuth({
    database: {
      adapter: mockAdapter,
    },
    plugins: [
      organization({
        schema: {
          organization: {
            additionalFields: {
              publicId: {
                type: "string",
                fieldName: "public_id",
                required: false,
                input: false,
                unique: true,
                returned: true,
              },
            },
          },
        },
      }),
    ],
  });

  console.log("Organization schema:", auth.options.plugins[0].schema.organization);
}

testOrganizationAdditionalFields().catch(console.error);
