import { createRouter } from "better-call";
import { createTodo } from "./actions";


export const router = createRouter({
    createTodo,
}, {
    basePath: "/api/v1",
    onError(e) {
        console.log(e)
    },
})