import { exportSearchIndexes } from "@/lib/export-search-indexes";

export const revalidate = false;

export async function GET() {
	return Response.json(await exportSearchIndexes());
}
