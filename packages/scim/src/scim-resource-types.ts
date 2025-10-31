export const SCIMUserResourceType = {
	schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
	id: "User",
	name: "User",
	endpoint: "/Users",
	description: "User Account",
	schema: "urn:ietf:params:scim:schemas:core:2.0:User",
	meta: {
		location: "https://example.com/v2/ResourceTypes/User",
		resourceType: "ResourceType",
	},
};
