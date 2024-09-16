"use server"
import { APIError, createEndpoint } from "better-call"
import { z } from "zod"
import { sessionMiddleware } from "./middleware"
import { db } from "./db"
import { TodoStatus } from "@prisma/client"

export const createTodo = createEndpoint("/todo/create", {
    method: "POST",
    body: z.object({
        title: z.string(),
        status: z.nativeEnum(TodoStatus),
        assignedTo: z.string().optional(),
    }),
    use: [sessionMiddleware]
}, async (ctx) => {
    const { session } = ctx.context
    try {
        const newTodo = await db.todo.create({
            data: {
                title: ctx.body.title,
                description: "",
                status: ctx.body.status,
                createdById: session.user.id,
                assignToId: session.session.activeOrganizationId ? ctx.body.assignedTo : undefined,
                organizationId: session.session.activeOrganizationId,
            },
            include: {
                createdBy: true,
                organization: true,
                assignTo: true
            }
        }).then(res => {
            return {
                ...res,
                assignToId: res.assignTo?.name || "",
                createdById: res.createdBy?.name || "",
            }
        })
        if (!newTodo) {
            throw new APIError("INTERNAL_SERVER_ERROR")
        }
        return ctx.json(newTodo)
    } catch (e) {
        console.log(e)
        throw new APIError("INTERNAL_SERVER_ERROR")
    }
})