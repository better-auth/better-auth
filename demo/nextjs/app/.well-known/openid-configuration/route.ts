import { auth } from "@/lib/auth";

export async function GET() {
	const response = await auth.api.getOpenIdConfig({
		asResponse: true,
	});

	response.headers.set("Access-Control-Allow-Origin", "*");
	response.headers.set("Access-Control-Allow-Methods", "GET");
	response.headers.set("Access-Control-Allow-Headers", "Content-Type");

	return response;
}
