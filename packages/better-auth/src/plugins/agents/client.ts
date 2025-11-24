// SPDX-FileCopyrightText: 2025-present Kriasoft
// SPDX-License-Identifier: MIT

import type { BetterAuthClientPlugin } from "better-auth/client"
import type { BetterFetchOption } from "@better-fetch/fetch"
import type { agents } from "./index"

export interface Agent {
  id: string
  userId: string
  name: string
  type: "ai_assistant" | "service_account" | "bot" | "workflow" | "integration" | "custom"
  status: "active" | "inactive" | "suspended" | "deleted"
  configuration: Record<string, any> | null
  ownerId: string | null
  ownerType: "user" | "organization"
  organizationId: string | null
  metadata: Record<string, any> | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateAgentRequest {
  name: string
  type?: "ai_assistant" | "service_account" | "bot" | "workflow" | "integration" | "custom"
  status?: "active" | "inactive" | "suspended" | "deleted"
  configuration?: Record<string, any>
  ownerType?: "user" | "organization"
  ownerId?: string
  organizationId?: string
  metadata?: Record<string, any>
}

export interface UpdateAgentRequest {
  id: string
  name?: string
  type?: "ai_assistant" | "service_account" | "bot" | "workflow" | "integration" | "custom"
  status?: "active" | "inactive" | "suspended" | "deleted"
  configuration?: Record<string, any>
  metadata?: Record<string, any>
}

export interface ListAgentsQuery {
  ownerType?: "user" | "organization"
  ownerId?: string
  organizationId?: string
  type?: string
  status?: string
  limit?: number
  offset?: number
}

export interface ListAgentsResponse {
  agents: Agent[]
  total: number
  limit: number
  offset: number
}

export interface AgentsClient {
  agents: {
    create: (data: CreateAgentRequest, fetchOptions?: BetterFetchOption) => Promise<{ data: Agent; error: null } | { data: null; error: any }>
    list: (query?: ListAgentsQuery, fetchOptions?: BetterFetchOption) => Promise<{ data: ListAgentsResponse; error: null } | { data: null; error: any }>
    get: (query: { id?: string; userId?: string }, fetchOptions?: BetterFetchOption) => Promise<{ data: Agent; error: null } | { data: null; error: any }>
    update: (data: UpdateAgentRequest, fetchOptions?: BetterFetchOption) => Promise<{ data: Agent; error: null } | { data: null; error: any }>
    delete: (data: { id: string }, fetchOptions?: BetterFetchOption) => Promise<{ data: { success: boolean }; error: null } | { data: null; error: any }>
  }
}

export function agentsClient(): BetterAuthClientPlugin {
  return {
    id: "agents",
    $InferServerPlugin: {} as ReturnType<typeof agents>,
    getActions: ($fetch) => {
      return {
        create: async (data: CreateAgentRequest, fetchOptions?: BetterFetchOption) => {
          try {
            const res = await $fetch("/agents/create", {
              method: "POST",
              body: data,
              ...fetchOptions,
            })
            return { data: res, error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
        list: async (query?: ListAgentsQuery, fetchOptions?: BetterFetchOption) => {
          try {
            const res = await $fetch("/agents/list", {
              method: "GET",
              query,
              ...fetchOptions,
            })
            return { data: res, error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
        get: async (query: { id?: string; userId?: string }, fetchOptions?: BetterFetchOption) => {
          try {
            const res = await $fetch("/agents/get", {
              method: "GET",
              query,
              ...fetchOptions,
            })
            return { data: res, error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
        update: async (data: UpdateAgentRequest, fetchOptions?: BetterFetchOption) => {
          try {
            const res = await $fetch("/agents/update", {
              method: "POST",
              body: data,
              ...fetchOptions,
            })
            return { data: res, error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
        delete: async (data: { id: string }, fetchOptions?: BetterFetchOption) => {
          try {
            const res = await $fetch("/agents/delete", {
              method: "POST",
              body: data,
              ...fetchOptions,
            })
            return { data: res, error: null }
          } catch (error) {
            return { data: null, error }
          }
        },
      }
    },
  } satisfies BetterAuthClientPlugin
}

export default agentsClient
