import { z } from "zod";
import { createAuthEndpoint } from "../call";
import { APIError } from "better-call";



export const callbackOAuth = createAuthEndpoint("/callback/:id", {
    method: "GET",
}, async (c) => {
    const url = `http://ex.com/${c.params.id}`
    c.setHeader("Location", url)
    throw new APIError("FOUND")
})