import { getRSS } from "@/lib/rss";

export const revalidate = false;

export function GET() {
  return new Response(getRSS());
}
