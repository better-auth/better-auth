import { AuthEndpoint } from "../api/call"
import { LiteralString } from "./helper"



export type Plugin = {
    id: LiteralString,
    endpoints: {
        [key: string]: AuthEndpoint
    }
}