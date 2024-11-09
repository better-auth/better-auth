import { ApiReference } from "@scalar/nextjs-api-reference";

const config = {
	spec: {
		url: "/openapi.yml",
	},
};

export const GET = ApiReference(config);
