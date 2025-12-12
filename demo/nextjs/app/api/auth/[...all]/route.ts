import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { POST, GET, PUT, PATCH, DELETE } = toNextJsHandler(auth);
