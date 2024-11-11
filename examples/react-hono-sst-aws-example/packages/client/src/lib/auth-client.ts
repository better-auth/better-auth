import { createAuthClient } from "better-auth/react"


export const authClient = createAuthClient({
    baseURL: "https://<lambda-url>.lambda-url.<region>.on.aws" // Replace with your Lambda URL
})