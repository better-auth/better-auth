// PATCH: Use a generic type if BetterAuthClientPlugin is not exported
// import type { BetterAuthClientPlugin } from "better-auth/client";
type BetterAuthClientPlugin = any;

// PATCH: If useAuthQuery is not exported, you may need to implement your own reactivity or remove it.
// For now, we'll comment it out and leave a placeholder.
import type { waitlist } from "./";
import { atom } from "nanostores";
// import { useAuthQuery } from "better-auth/client/plugins"; // <-- Remove if not exported

// Types for waitlist
export type WaitlistEntry = {
  id: string;
  email: string;
  name?: string;
  status: "pending" | "approved" | "rejected";
  position?: number;
  priority?: number;
  joinedAt: Date;
  approvedAt?: Date;
  metadata?: string;
};

export type WaitlistAnalytics = {
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    conversionRate: number;
  };
  recentActivity: Array<{
    event: string;
    email: string;
    timestamp: Date;
    metadata?: string;
  }>;
};

export const waitlistClient = (): BetterAuthClientPlugin => {
  // Reactive atoms for state management
  const $waitlistStatus = atom<WaitlistEntry | null>(null);
  const $waitlistAnalytics = atom<WaitlistAnalytics | null>(null);
  const $waitlistEntries = atom<WaitlistEntry[]>([]);

  return {
    id: "waitlist",
    $InferServerPlugin: {} as ReturnType<typeof waitlist>,

    getActions: (
      $fetch: any,
      $store: any,
      options: any
    ) => ({
      // Join waitlist
      async joinWaitlist(
        data: {
          email: string;
          name?: string;
          inviteCode?: string;
          priority?: string;
          metadata?: Record<string, any>;
        },
        fetchOptions?: any
      ) {
        const result = await $fetch("/waitlist/join", {
          method: "POST",
          body: data,
          ...fetchOptions,
        });
        if (result.data) {
          $store.notify("waitlistJoined");
        }
        return result;
      },

      // Get waitlist status
      async getWaitlistStatus(email: string, fetchOptions?: any) {
        const result = await $fetch("/waitlist/status", {
          method: "GET",
          query: { email },
          ...fetchOptions,
        });
        if (result.data?.entry) {
          $waitlistStatus.set(result.data.entry);
        }
        return result;
      },

      // Admin: Approve a waitlist entry
      async approveWaitlist(data: { email: string }, fetchOptions?: any) {
        const result = await $fetch("/waitlist/approve", {
          method: "POST",
          body: data,
          ...fetchOptions,
        });
        if (result.data) {
          $store.notify("waitlistUpdated");
        }
        return result;
      },

      // Admin: Bulk approve
      async bulkApprove(
        data: { emails: string[]; sendNotifications?: boolean },
        fetchOptions?: any
      ) {
        const result = await $fetch("/waitlist/bulk-approve", {
          method: "POST",
          body: data,
          ...fetchOptions,
        });
        if (result.data) {
          $store.notify("waitlistBulkUpdated");
        }
        return result;
      },

      // Admin: Generate invite codes
      async generateInvites(
        data: {
          count: number;
          expiresIn?: number;
          metadata?: Record<string, any>;
        },
        fetchOptions?: any
      ) {
        return $fetch("/waitlist/generate-invites", {
          method: "POST",
          body: data,
          ...fetchOptions,
        });
      },

      // Admin: Get analytics
      async getAnalytics(
        data?: { startDate?: string; endDate?: string },
        fetchOptions?: any
      ) {
        const result = await $fetch("/waitlist/analytics", {
          method: "GET",
          query: data || {},
          ...fetchOptions,
        });
        if (result.data) {
          $waitlistAnalytics.set(result.data);
        }
        return result;
      },

      // Admin: Export waitlist
      async exportWaitlist(
        data?: {
          format?: "json" | "csv";
          status?: "all" | "pending" | "approved" | "rejected";
        },
        fetchOptions?: any
      ) {
        return $fetch("/waitlist/export", {
          method: "GET",
          query: data || {},
          ...fetchOptions,
        });
      },

      // Admin: List waitlist entries
      async listWaitlistEntries(
        data?: { status?: string; limit?: number; offset?: number },
        fetchOptions?: any
      ) {
        const result = await $fetch("/waitlist/list", {
          method: "GET",
          query: data || {},
          ...fetchOptions,
        });
        if (result.data?.entries) {
          $waitlistEntries.set(result.data.entries);
        }
        return result;
      },
    }),

    // PATCH: getAtoms and useAuthQuery removed for compatibility if not exported
    getAtoms: (_$fetch: any) => ({
      $waitlistStatus,
      $waitlistAnalytics,
      $waitlistEntries,
    }),

    pathMethods: {
      "/waitlist/join": "POST",
      "/waitlist/approve": "POST",
      "/waitlist/bulk-approve": "POST",
      "/waitlist/generate-invites": "POST",
      "/waitlist/analytics": "GET",
      "/waitlist/export": "GET",
      "/waitlist/status": "GET",
      "/waitlist/list": "GET",
    },

    atomListeners: [
      {
        matcher: (path: any) => path.startsWith("/waitlist/"),
        signal: "waitlistUpdated",
      },
      {
        matcher: (path: any) => path === "/waitlist/join",
        signal: "waitlistJoined",
      },
      {
        matcher: (path: any) => path === "/waitlist/bulk-approve",
        signal: "waitlistBulkUpdated",
      },
    ],
  } as BetterAuthClientPlugin;
};