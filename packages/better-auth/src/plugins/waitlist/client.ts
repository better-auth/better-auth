import type { BetterAuthClientPlugin } from "better-auth/client";  
import type { waitlist } from "./index";  
import { atom } from "nanostores";  
import { useAuthQuery } from "better-auth/client/plugins";  
  
export const waitlistClient = () => {  
  // Reactive atoms for state management  
  const $waitlistStatus = atom<any>(null);  
  const $waitlistAnalytics = atom<any>(null);  
  const $waitlistEntries = atom<any[]>([]);  
  
  return {  
    id: "waitlist",  
    $InferServerPlugin: {} as ReturnType<typeof waitlist>,  
      
    // Custom actions for waitlist operations  
    getActions: ($fetch, $store, options) => ({  
      // Join waitlist  
      joinWaitlist: async (data: {  
        email: string;  
        name?: string;  
        inviteCode?: string;  
        priority?: string;  
        metadata?: Record<string, any>;  
      }, fetchOptions?: any) => {  
        const result = await $fetch("/waitlist/join", {  
          method: "POST",  
          body: data,  
          ...fetchOptions  
        });  
          
        // Update local state  
        if (result.data) {  
          $store.notify("waitlistJoined");  
        }  
          
        return result;  
      },  
  
      // Get waitlist status  
      getWaitlistStatus: async (email: string, fetchOptions?: any) => {  
        const result = await $fetch("/waitlist/status", {  
          method: "GET",  
          query: { email },  
          ...fetchOptions  
        });  
          
        if (result.data) {  
          $waitlistStatus.set(result.data.entry);  
        }  
          
        return result;  
      },  
  
      // Admin actions  
      approveWaitlist: async (data: { email: string }, fetchOptions?: any) => {  
        const result = await $fetch("/waitlist/approve", {  
          method: "POST",  
          body: data,  
          ...fetchOptions  
        });  
          
        if (result.data) {  
          $store.notify("waitlistUpdated");  
        }  
          
        return result;  
      },  
  
      // Bulk approve users  
      bulkApprove: async (data: {  
        emails: string[];  
        sendNotifications?: boolean;  
      }, fetchOptions?: any) => {  
        const result = await $fetch("/waitlist/bulk-approve", {  
          method: "POST",  
          body: data,  
          ...fetchOptions  
        });  
          
        if (result.data) {  
          $store.notify("waitlistBulkUpdated");  
        }  
          
        return result;  
      },  
  
      // Generate invite codes  
      generateInvites: async (data: {  
        count: number;  
        expiresIn?: number;  
        metadata?: Record<string, any>;  
      }, fetchOptions?: any) => {  
        return $fetch("/waitlist/generate-invites", {  
          method: "POST",  
          body: data,  
          ...fetchOptions  
        });  
      },  
  
      // Get analytics  
      getAnalytics: async (data?: {  
        startDate?: string;  
        endDate?: string;  
      }, fetchOptions?: any) => {  
        const result = await $fetch("/waitlist/analytics", {  
          method: "GET",  
          query: data || {},  
          ...fetchOptions  
        });  
          
        if (result.data) {  
          $waitlistAnalytics.set(result.data);  
        }  
          
        return result;  
      },  
  
      // Export waitlist  
      exportWaitlist: async (data?: {  
        format?: "json" | "csv";  
        status?: "all" | "pending" | "approved" | "rejected";  
      }, fetchOptions?: any) => {  
        return $fetch("/waitlist/export", {  
          method: "GET",  
          query: data || {},  
          ...fetchOptions  
        });  
      },  
  
      // List waitlist entries (admin)  
      listWaitlistEntries: async (data?: {  
        status?: string;  
        limit?: number;  
        offset?: number;  
      }, fetchOptions?: any) => {  
        const result = await $fetch("/waitlist/list", {  
          method: "GET",  
          query: data || {},  
          ...fetchOptions  
        });  
          
        if (result.data) {  
          $waitlistEntries.set(result.data.entries || []);  
        }  
          
        return result;  
      },  
    }),  
  
    // Reactive atoms for framework integration  
    getAtoms: ($fetch) => {  
      // Waitlist status atom with auto-refresh  
      const waitlistStatus = useAuthQuery(  
        $waitlistStatus,  
        "/waitlist/status",  
        $fetch,  
        {  
          method: "GET",  
          enabled: false, // Only fetch when explicitly called  
        }  
      );  
  
      // Analytics atom  
      const waitlistAnalytics = useAuthQuery(  
        $waitlistAnalytics,  
        "/waitlist/analytics",  
        $fetch,  
        {  
          method: "GET",  
          enabled: false,  
        }  
      );  
  
      // Waitlist entries atom  
      const waitlistEntries = useAuthQuery(  
        $waitlistEntries,  
        "/waitlist/list",  
        $fetch,  
        {  
          method: "GET",  
          enabled: false,  
        }  
      );  
  
      return {  
        waitlistStatus,  
        waitlistAnalytics,  
        waitlistEntries,  
        $waitlistStatus,  
        $waitlistAnalytics,  
        $waitlistEntries,  
      };  
    },  
  
    // Path method overrides if needed  
    pathMethods: {  
      "/waitlist/join": "POST",  
      "/waitlist/approve": "POST",  
      "/waitlist/bulk-approve": "POST",  
      "/waitlist/generate-invites": "POST",  
      "/waitlist/analytics": "GET",  
      "/waitlist/export": "GET",  
      "/waitlist/status": "GET",  
    },  
  
    // Atom listeners for reactive updates  
    atomListeners: [  
      {  
        matcher: (path) => path.startsWith("/waitlist/"),  
        signal: "waitlistUpdated",  
      },  
      {  
        matcher: (path) => path === "/waitlist/join",  
        signal: "waitlistJoined",  
      },  
      {  
        matcher: (path) => path === "/waitlist/bulk-approve",  
        signal: "waitlistBulkUpdated",  
      },  
    ],  
  } satisfies BetterAuthClientPlugin;  
};  
  
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