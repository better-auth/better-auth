import { auth } from "~/lib/auth";
import { APIEvent } from "@solidjs/start/server";

export async function GET(event: APIEvent) {
  return auth.handler(event.request);
}

export async function POST(event: APIEvent) {
  return auth.handler(event.request);
}