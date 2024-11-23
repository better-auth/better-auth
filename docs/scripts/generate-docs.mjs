import { generateFiles } from "fumadocs-openapi";

void generateFiles({
	input: ["./open-api.yaml"], // the OpenAPI schemas
	output: "./content/docs/api",
});
