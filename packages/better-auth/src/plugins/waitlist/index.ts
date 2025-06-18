// TEMP: Patch type if not exported in your better-auth
// import type { BetterAuthPlugin } from "better-auth";
type BetterAuthPlugin = any;

// Patch getDate if not available in your utils
const getDate = () => new Date();

import { createAuthEndpoint, createAuthMiddleware, APIError } from "better-auth/api";
import { z } from "zod";

export interface WaitlistOptions {
  adminUserIds?: string[];
  adminRoles?: string[];
  autoApprove?: boolean;
  maxWaitlistSize?: number;
  sendNotificationEmail?: (data: {
    email: string;
    status: 'pending' | 'approved' | 'rejected' | 'invited';
    position?: number;
    inviteToken?: string;
  }) => Promise<void>;
  rateLimit?: {
    enabled?: boolean;
    window?: number;
    max?: number;
  };
  inviteExpiration?: number; // seconds
  requireInvite?: boolean;
  enablePriority?: boolean;
  priorityLevels?: Record<string, number>;
  enableAnalytics?: boolean;
  validateWaitlistEntry?: (data: any) => Promise<boolean>;
}

const WAITLIST_ERROR_CODES = {
  ALREADY_ON_WAITLIST: "User is already on the waitlist",
  WAITLIST_FULL: "Waitlist has reached maximum capacity",
  INVALID_INVITE_CODE: "Invalid or expired invite code",
  UNAUTHORIZED_ADMIN: "Unauthorized to perform admin actions",
  ENTRY_NOT_FOUND: "Waitlist entry not found",
  VALIDATION_FAILED: "Waitlist entry validation failed",
  JOIN_THE_WAITLIST_FIRST: "Please join the waitlist first",
} as const;

export const waitlist = (options: WaitlistOptions = {}): BetterAuthPlugin => {
  const opts = {
    autoApprove: options.autoApprove ?? false,
    maxWaitlistSize: options.maxWaitlistSize ?? 10000,
    inviteExpiration: options.inviteExpiration ?? 7 * 24 * 60 * 60, // 7 days
    requireInvite: options.requireInvite ?? false,
    enablePriority: options.enablePriority ?? false,
    enableAnalytics: options.enableAnalytics ?? true,
    rateLimit: {
      enabled: options.rateLimit?.enabled ?? true,
      window: options.rateLimit?.window ?? 60, // 1 minute
      max: options.rateLimit?.max ?? 5,
    },
    ...options,
  };

  return {
    id: "waitlist",

    endpoints: {
      // --- Join waitlist ---
      joinWaitlist: createAuthEndpoint(
        "/waitlist/join",
        {
          method: "POST",
          body: z.object({
            email: z.string().email(),
            name: z.string().optional(),
            inviteCode: z.string().optional(),
            priority: z.string().optional(),
            metadata: z.record(z.any()).optional(),
          }),
        },
        async (ctx: any) => {
          const { email, name, inviteCode, priority, metadata } = ctx.body;

          // Custom validation
          if (opts.validateWaitlistEntry) {
            const isValid = await opts.validateWaitlistEntry(ctx.body);
            if (!isValid) throw new APIError("BAD_REQUEST", { message: WAITLIST_ERROR_CODES.VALIDATION_FAILED });
          }

          // Existing entry check
          const existing = await ctx.context.internalAdapter.findOne({ model: "waitlist", where: { email } });
          if (existing) throw new APIError("BAD_REQUEST", { message: WAITLIST_ERROR_CODES.ALREADY_ON_WAITLIST });

          const currentCount = await ctx.context.internalAdapter.count({ model: "waitlist", where: {} });
          if (currentCount >= opts.maxWaitlistSize) throw new APIError("BAD_REQUEST", { message: WAITLIST_ERROR_CODES.WAITLIST_FULL });

          // Invite code validation
          let invite = null;
          if (opts.requireInvite && !inviteCode)
            throw new APIError("BAD_REQUEST", { message: WAITLIST_ERROR_CODES.INVALID_INVITE_CODE });
          if (inviteCode) {
            invite = await ctx.context.internalAdapter.findOne({
              model: "waitlistInvite",
              where: { code: inviteCode, used: false },
            });
            if (!invite || (invite.expiresAt && invite.expiresAt < new Date()))
              throw new APIError("BAD_REQUEST", { message: WAITLIST_ERROR_CODES.INVALID_INVITE_CODE });
          }

          const priorityScore = opts.enablePriority && priority ? opts.priorityLevels?.[priority] ?? 0 : 0;
          const position = currentCount + 1;
          const status = opts.autoApprove ? "approved" : "pending";
          const now = getDate();

          const entry = await ctx.context.internalAdapter.create({
            model: "waitlist",
            data: {
              email, name, status, position, priority: priorityScore, joinedAt: now,
              approvedAt: opts.autoApprove ? now : null,
              inviteCode: inviteCode || null,
              metadata: metadata ? JSON.stringify(metadata) : null,
            },
          });

          if (invite) {
            await ctx.context.internalAdapter.update({
              model: "waitlistInvite",
              where: { code: inviteCode },
              data: { used: true, usedAt: now, usedBy: email },
            });
          }

          if (opts.sendNotificationEmail) {
            await opts.sendNotificationEmail({
              email, status, position, inviteToken: inviteCode || undefined,
            });
          }

          if (opts.enableAnalytics) {
            await ctx.context.internalAdapter.create({
              model: "waitlistAnalytics",
              data: {
                event: "joined",
                email,
                metadata: metadata ? JSON.stringify(metadata) : null,
                timestamp: now,
              },
            });
          }

          return ctx.json({
            success: true,
            entry,
            position,
            status,
            estimatedWaitTime: calculateEstimatedWaitTime(position),
          });
        }
      ),

      // --- Get waitlist status for user ---
      getWaitlistStatus: createAuthEndpoint(
        "/waitlist/status",
        {
          method: "GET",
          query: z.object({
            email: z.string().email(),
          }),
        },
        async (ctx: any) => {
          const { email } = ctx.query;
          const entry = await ctx.context.internalAdapter.findOne({
            model: "waitlist",
            where: { email },
          });
          if (!entry) {
            throw new APIError("NOT_FOUND", {
              message: WAITLIST_ERROR_CODES.ENTRY_NOT_FOUND,
            });
          }
          return ctx.json({ entry });
        }
      ),

      // --- Approve waitlist entry ---
      approveWaitlist: createAuthEndpoint(
        "/waitlist/approve",
        {
          method: "POST",
          body: z.object({
            email: z.string().email(),
          }),
        },
        async (ctx: any) => {
          await validateAdminAccess(ctx, opts);

          const { email } = ctx.body;
          const entry = await ctx.context.internalAdapter.findOne({
            model: "waitlist",
            where: { email },
          });
          if (!entry) {
            throw new APIError("NOT_FOUND", {
              message: WAITLIST_ERROR_CODES.ENTRY_NOT_FOUND,
            });
          }
          const updated = await ctx.context.internalAdapter.update({
            model: "waitlist",
            where: { email },
            data: {
              status: "approved",
              approvedAt: getDate(),
              approvedBy: ctx.context.session?.userId,
            },
          });

          if (opts.sendNotificationEmail) {
            await opts.sendNotificationEmail({
              email,
              status: "approved",
              position: updated.position,
            });
          }

          return ctx.json({ success: true, entry: updated });
        }
      ),

      // --- Bulk approve entries ---
      bulkApprove: createAuthEndpoint(
        "/waitlist/bulk-approve",
        {
          method: "POST",
          body: z.object({
            emails: z.array(z.string().email()),
            sendNotifications: z.boolean().optional(),
          }),
        },
        async (ctx: any) => {
          await validateAdminAccess(ctx, opts);

          const { emails, sendNotifications = true } = ctx.body;
          const results: Array<{ email: string; success: boolean; error?: string }> = [];

          for (const email of emails) {
            try {
              const updated = await ctx.context.internalAdapter.update({
                model: "waitlist",
                where: { email },
                data: {
                  status: "approved",
                  approvedAt: getDate(),
                  approvedBy: ctx.context.session?.userId,
                },
              });
              if (sendNotifications && opts.sendNotificationEmail) {
                await opts.sendNotificationEmail({
                  email,
                  status: "approved",
                  position: updated.position,
                });
              }
              results.push({ email, success: true });
            } catch (error: any) {
              results.push({ email, success: false, error: error?.message || String(error) });
            }
          }

          return ctx.json({ results });
        }
      ),

      // --- Generate invite codes ---
      generateInvites: createAuthEndpoint(
        "/waitlist/generate-invites",
        {
          method: "POST",
          body: z.object({
            count: z.number().min(1).max(100),
            expiresIn: z.number().optional(),
            metadata: z.record(z.any()).optional(),
          }),
        },
        async (ctx: any) => {
          await validateAdminAccess(ctx, opts);

          const { count, expiresIn, metadata } = ctx.body;
          const invites = [];
          for (let i = 0; i < count; i++) {
            const code = ctx.context.generateId
              ? ctx.context.generateId()
              : Math.random().toString(36).slice(2, 10);
            const expiresAt = new Date(Date.now() + ((expiresIn || opts.inviteExpiration) * 1000));
            const invite = await ctx.context.internalAdapter.create({
              model: "waitlistInvite",
              data: {
                code,
                expiresAt,
                createdBy: ctx.context.session?.userId,
                metadata: metadata ? JSON.stringify(metadata) : null,
                used: false,
              },
            });
            invites.push(invite);
          }
          return ctx.json({ invites });
        }
      ),

      // --- Analytics dashboard ---
      getAnalytics: createAuthEndpoint(
        "/waitlist/analytics",
        {
          method: "GET",
          query: z.object({
            startDate: z.string().optional(),
            endDate: z.string().optional(),
          }),
        },
        async (ctx: any) => {
          await validateAdminAccess(ctx, opts);

          const { startDate, endDate } = ctx.query;

          const totalEntries = await ctx.context.internalAdapter.count({
            model: "waitlist",
            where: {},
          });

          const pendingEntries = await ctx.context.internalAdapter.count({
            model: "waitlist",
            where: { status: "pending" },
          });

          const approvedEntries = await ctx.context.internalAdapter.count({
            model: "waitlist",
            where: { status: "approved" },
          });

          const conversionRate = totalEntries > 0
            ? (approvedEntries / totalEntries) * 100
            : 0;

          let recentActivity: any[] = [];
          if (opts.enableAnalytics) {
            const whereClause: any = {};
            if (startDate) whereClause.timestamp = { gte: new Date(startDate) };
            if (endDate) whereClause.timestamp = { ...whereClause.timestamp, lte: new Date(endDate) };

            recentActivity = await ctx.context.internalAdapter.findMany({
              model: "waitlistAnalytics",
              where: whereClause,
              limit: 100,
              orderBy: { timestamp: "desc" },
            });
          }

          return ctx.json({
            stats: {
              total: totalEntries,
              pending: pendingEntries,
              approved: approvedEntries,
              rejected: totalEntries - pendingEntries - approvedEntries,
              conversionRate: Math.round(conversionRate * 100) / 100,
            },
            recentActivity,
          });
        }
      ),

      // --- Export waitlist data ---
      exportWaitlist: createAuthEndpoint(
        "/waitlist/export",
        {
          method: "GET",
          query: z.object({
            format: z.enum(["csv", "json"]).default("json"),
            status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
          }),
        },
        async (ctx: any) => {
          await validateAdminAccess(ctx, opts);

          const { format, status } = ctx.query;
          const whereClause = status !== "all" ? { status } : {};
          const entries = await ctx.context.internalAdapter.findMany({
            model: "waitlist",
            where: whereClause,
            orderBy: { joinedAt: "asc" },
          });

          if (format === "csv") {
            const csv = convertToCSV(entries);
            return new Response(csv, {
              headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": "attachment; filename=waitlist.csv",
              },
            });
          }

          return ctx.json({ entries });
        }
      ),

      // --- List waitlist entries (admin) ---
      listWaitlistEntries: createAuthEndpoint(
        "/waitlist/list",
        {
          method: "GET",
          query: z.object({
            status: z.string().optional(),
            limit: z.number().min(1).max(1000).optional(),
            offset: z.number().min(0).optional(),
          }),
        },
        async (ctx: any) => {
          await validateAdminAccess(ctx, opts);

          const { status, limit = 100, offset = 0 } = ctx.query;
          const whereClause = status ? { status } : {};
          const entries = await ctx.context.internalAdapter.findMany({
            model: "waitlist",
            where: whereClause,
            limit,
            offset,
            orderBy: { joinedAt: "asc" },
          });

          return ctx.json({ entries });
        }
      ),
    },

    // --- Hooks for signup interception ---
    hooks: {
      before: [
        {
          matcher: (context: any) => context.path.startsWith("/sign-up"),
          handler: createAuthMiddleware(async (ctx: any) => {
            const { email } = ctx.body;
            const waitlistEntry = await ctx.context.internalAdapter.findOne({
              model: "waitlist",
              where: { email },
            });
            if (!waitlistEntry) {
              throw new APIError("FORBIDDEN", {
                message: WAITLIST_ERROR_CODES.JOIN_THE_WAITLIST_FIRST,
                code: "WAITLIST_REQUIRED",
              });
            }
            if (waitlistEntry.status !== "approved") {
              throw new APIError("FORBIDDEN", {
                message: `Your waitlist status is: ${waitlistEntry.status}`,
                code: "WAITLIST_NOT_APPROVED",
              });
            }
          }),
        },
      ],
    },

    rateLimit: opts.rateLimit.enabled
      ? [{
        pathMatcher: (path: string) => path.startsWith("/waitlist/"),
        window: opts.rateLimit.window,
        max: opts.rateLimit.max,
      }]
      : undefined,

    $ERROR_CODES: WAITLIST_ERROR_CODES,
  } as BetterAuthPlugin;
};

async function validateAdminAccess(ctx: any, opts: WaitlistOptions) {
  const session = ctx.context.session;
  if (!session) throw new APIError("UNAUTHORIZED", { message: "Authentication required" });
  const user = await ctx.context.internalAdapter.findUserById(session.userId);
  const isAdmin = opts.adminUserIds?.includes(session.userId) || (user?.role && opts.adminRoles?.includes(user.role));
  if (!isAdmin) throw new APIError("FORBIDDEN", { message: WAITLIST_ERROR_CODES.UNAUTHORIZED_ADMIN });
}

function calculateEstimatedWaitTime(position: number): string {
  const daysToApproval = Math.ceil(position / 10);
  return `${daysToApproval} day${daysToApproval !== 1 ? "s" : ""}`;
}

function convertToCSV(data: any[]): string {
  if (!data.length) return "";
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers.map((header) => JSON.stringify(row[header] ?? "")).join(",")
    ),
  ].join("\n");
  return csvContent;
}