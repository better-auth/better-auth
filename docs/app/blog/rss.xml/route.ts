import { getRSS } from "@/lib/rss";

export const revalidate = false;

export function GET() {
  return new Response(getRSS(), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8"
    }
  });
}
