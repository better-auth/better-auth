import { source } from "@/lib/source";
import { getLLMText } from "../docs/lib/get-llm-text";

export const revalidate = false;

export async function GET() {
	const scan = source
		.getPages()
		.filter((file) => file.slugs[0] !== "openapi")
		.map(getLLMText);
	const scanned = await Promise.all(scan);

	return new Response(scanned.join("\n\n"));
}
