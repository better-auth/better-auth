import { auth } from "@/lib/auth/server";
import { toNextJSHandler } from "better-auth/next";

export const { GET, POST } = toNextJSHandler(auth.handler);
