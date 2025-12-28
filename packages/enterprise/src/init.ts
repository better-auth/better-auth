import { initializeGraph } from "better-auth";
import { readFile } from "fs/promises";

import { AuthzedSyncClient } from "better-auth/plugins";

const schemaText = await readFile("./src/authzed-schema.zed", "utf-8");
const authzedClient = new AuthzedSyncClient({
	token: "secret",
	endpoint: "localhost:50052",
});

await authzedClient.writeSchema(schemaText);
await initializeGraph(authzedClient);

// db.insert(t.platform_role).values({
// 	role: "platform_admin",
// 	name: "Platform Admin",
// 	description: "Platform Admin",
// 	metadata: {},
// });

// await authzedClient.syncRelationshipsBatch([
// 	{
// 		objectId: "platform_admin",
// 		objectType: "platform_role",
// 		relationshipType: "platform",
// 		subjectId: "default",
// 		subjectType: "platform",
// 		operation: "touch",
// 	},
// 	{
// 		objectId: "default",
// 		objectType: "platform",
// 		relationshipType: "org_administrator",
// 		subjectId: "platform_admin",
// 		subjectType: "platform_role",
// 		optionalRelation: "member",
// 		operation: "touch",
// 	},
// 	{
// 		objectId: "default",
// 		objectType: "platform",
// 		relationshipType: "role_manager",
// 		subjectId: "platform_admin",
// 		subjectType: "platform_role",
// 		optionalRelation: "member",
// 		operation: "touch",
// 	},
// 	{
// 		objectId: "default",
// 		objectType: "platform",
// 		relationshipType: "user_administrator",
// 		subjectId: "platform_admin",
// 		subjectType: "platform_role",
// 		optionalRelation: "member",
// 		operation: "touch",
// 	},
// ]);

// try {
// 	if (
// 		!(await db.query.user.findFirst({
// 			where: eq(t.user.id, "usr_000000000000000000000000"),
// 		}))
// 	) {
// 		await db.insert(t.user).values({
// 			id: "usr_000000000000000000000000",
// 			email: "admin@rio.software",
// 			name: "Admin",
// 			platformRole: "platform_admin",
// 			emailVerified: true,
// 		});
// 		await db.insert(t.account).values({
// 			accountId: "usr_000000000000000000000000",
// 			userId: "usr_000000000000000000000000",
// 			providerId: "credential",
// 			id: "acc_000000000000000000000000",
// 			password: await hashPassword("lepton@123"),
// 			createdAt: new Date(),
// 			updatedAt: new Date(),
// 		});
// 	}

// 	await authzedClient.syncRelationshipsBatch([
// 		{
// 			objectId: "default",
// 			objectType: "platform",
// 			relationshipType: "user",
// 			subjectId: "usr_000000000000000000000000",
// 			subjectType: "user",
// 			operation: "touch",
// 		},
// 		{
// 			objectId: "platform_admin",
// 			objectType: "platform_role",
// 			relationshipType: "has_role",
// 			subjectId: "usr_000000000000000000000000",
// 			subjectType: "user",
// 			operation: "touch",
// 		},
// 	]);
// } catch (error) {
// 	console.error(error);
// }

// const { headers } = await auth.api.signInEmail({
//   body: {
//     email: "admin@rio.software",
//     password: "lepton@123",
//   },
//   returnHeaders: true,
// })

// const cookie = headers.get("set-cookie")
// if (!cookie) {
//   throw new Error("No cookie found")
// }
