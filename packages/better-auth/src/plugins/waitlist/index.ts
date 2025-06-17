import { createAuthEndpoint, createAuthMiddleware, APIError } from "better-auth/api";  
import type { BetterAuthPlugin, AuthPluginSchema } from "better-auth";  
import { z } from "zod";  
import { getDate } from "better-auth/utils";  



export interface WaitlistOptions {
  // Admin Configuration
  adminUserIds?: string[];
  adminRoles?: string[];

  // Approval settings
  autoApprove?: boolean;
  maxWailistSize?: number;

  // Email notifications
  sendNotificationEmail?: (data: {
    email: string;
    status: 'pending' | 'approved' | 'rejected' | 'invited';
    position?: number;
    inviteToken?: string;
  }) => Promise<void>;

  // Rate limiting
  rateLimit?: {
    enabled?: boolean;
    window?: number;
    max?: number;
  };

  // Invitation system
  inviteExpiration?: number; // seconds
  requireInvite?: boolean;

  // Priority system
  enabledPriority?: boolean;
  priorityLevels?: Record<string, number>;

  // Analytics
  enabledAnalytics?: boolean;

  // Customer validation
  validateWailistEntry?: (data: any) => Promise<boolean>;
}

const WAITLIST_ERROR_CODES {
  ALREADY_ON_WAITLIST: "User is already on the waitlist",
  WAITLIST_FULL: "Waitlist has reached maximum capacity",
  INVALID_INVITE_CODE: "Invalid or expired invite code",
  UNAUTHORIZED_ADMIN: "Unauthorized to perform admin actions",
  ENTRY_NOT_FOUND: "Waitlist entry not found",
  VALIDATION_FAILED: "Waitlist entry validation failed",
  JOIN_THE_WAITLIST_FIRST: "Please Join the waitlist first",
} as const;

export const waitlist = (options: WaitlistOptions = {}) => {
  const opts = {
    autoApprove: options.autoApprove ?? false,
    maxWailistSize: options.maxWailistSize ?? 10000,
    inviteExpiration: options.inviteExpiration?? 7 * 24 * 60 * 60, // 7 days
    requireInvite: options.requireInvite?? false,
    enabledPriority: options.enabledPriority?? false,
    enabledAnalytics: options.enabledAnalytics?? true,
    rateLimit: {
      enabled: options.rateLimit?.enabled?? true,
      window: options.rateLimit?.window?? 60, // 1 minute
      max: options.rateLimit?.max?? 5,
    },
    ...options,
  };

  return {
    id: "waitlist",
    schema: waitlistSchema,

    // Endpoints
    endpoints: {
      // Join waitlist with validation
      joinWaitlist: createAuthEndpoint("/waitlist/join", {
        method: "POST",
        body: z.object({
          email: z.string().email(),
          name: z.string().optional(),
          inviteCode: z.string().optional(),
          priority: z.string().optional(),
          metadata: z.record(z.any()).optional(),
        }),
      }, async (ctx) => {
        const { email, name, inviteCode, priority, metadata } = ctx.body;
        
        // Custom validation
        if (opts.validateWaitlistEntry) {
          const isValid = await opts.validateWaitlistEntry(ctx.body);
          if (!isValid) {
            throw new APIError("BAD_REQUEST", {
              message: WAITLIST_ERROR_CODES.VALIDATION_FAILED,
            });
          }
        }

        // Check existing entry
        const existing =  await ctx.context.internalAdapter.findOne({
          model: "waitlist",
          where: {email}
        });

        if (existing) {
          throw new APIError("BAD_REQUEST", {
            message: WAITLIST_ERROR_CODES.ALREADY_ON_WAITLIST,
          });
        }

        // Check waitlist capacity
        const currentCount = await ctx.context.internalAdapter.count({
          model: "waitlist",
          where: {status: "pending"}
        });

        if (currentCount >= opts.maxWailistSize) {
          throw new APIError("BAD_REQUEST", {
            message: WAITLIST_ERROR_CODES.WAITLIST_FULL,
          });
        }

        // Validate invite code if required
        if (opts.requireInviteCode && !inviteCode) {
          throw new APIError("BAD_REQUEST", {
            message: WAITLIST_ERROR_CODES.INVALID_INVITE_CODE,
          });
        }

        if (inviteCode) {
          const invite = await ctx.content.internalAdapter.findOne({
            model: "waitlistInvite",
            where: {code: inviteCode, used: false}
          });

          if (!invite || invite.expiresAt < new Date()) {
            throw new APIError("BAD_REQUEST", {
              message: WAITLIST_ERROR_CODES.INVALID_INVITE_CODE,
            });
          }
        }

        // Calculate priority and position
        const priorityScore = opts.enablePriority && priority
        ? opts.priorityLevels?.[priority] ?? 0: 0;

        const position = currentCount + 1;

        const entry = await ctx.context.internalAdapter.create({
          model: "waitlist",
          data: {
            email,
            name,
            status: opts.autoApprove ? "approved" : "pending",
            position,
            priority: priorityScore,
            inviteCode,
            metadata: metadata ?? JSON.stringify(metadata) : null,
            joinedAt: new Date(),
            ipAddress: ctx.req.headers["x-forwarded-for"] || "unknown",
          }
        });

        // Mark invite as used
        if (inviteCode) {
          await ctx.context.internalAdapter.update({
            model: "waitlistInvite",
            where: {code: inviteCode},
            data: {used: true, usedAt: new Date(), usedBy: email}
          });
        }

        // Send notification
        if (opts.sendNotificationEmail) {
          await opts.sendNotificationEmail({
            email,
            status: entry.status,
            position: entry.position,
          });
        }

        // Analytics tracking
        if (opts.enableAnalytics) {
          await ctx.context.internalAdapter.create({
            model: "waitlistAnalytics",
            data: {
              event: "joined",
              email,
              metadata: JSON.stringify({ priority, inviteCode }) : null, 
              timestamp: new Date(),
            }
          });
        }

        return ctx.json({
          success: true,
          position: entry.position,
          status: entry.status,
          estimatedWaitTime: calculateEstimatedWaitTime(entry.position),
        });
      }),

      // Bulk approve users
      bulkApprove: createAuthEndpoint("/waitlist/bulk-approve", {
        method: "POST",
        body: z.object({
          emails: z.array(z.string().email()),
          sendNotification: z.boolean().default(true),
        }),
      }, async (ctx) => {
        await validatedAdminAccess(ctx, opts);

        const { email, sendNotifications } = ctx.body;
        const results = [];

        for (const email of emails) {
          try {
            const updated = await ctx.context.internalAdapter.update({
              model: "waitlist",
              where: {email},
              data: {
                status: "approved",
                approvedAt: new Date(),
                approvedBy: ctx.context.session?.userId,
              }
            });

            if(sendNotifications && opts.sendNotificationEmail) {
              await opts.sendNotificationEmail({
                email,
                status: "approved",
              });
            }

            results.push({
              email,
              success: true,
            });
          } catch (error) {
            result.push({ email, success: false, error: error.message});
          }
        }

        return ctx.json({
          results
        });
      }),

      // Generate invite codes
      generateInvites: createAuthEndpoint("/waitlist/generate-invites", {
        method: "POST",
        body: z.object({
          count: z.number().min(1).max(100),
          expiration: z.number().optional(),
          metadata: z.record(z.any()).optional(),
        }), 
      }, async (ctx) => {
        await validateAdminAccess(ctx, opts);

        const { count, expiration, metadata } = ctx.body;
        const invites = [];

        for (let i = 0; i < count; i++) {
          const code = ctx.context.generateId();
          const expiresAt = getDate(expiresIn || opts.inviteExpiration, "sec");

          const invite = await ctx.context.internalAdapter.create({
            model: "waitlistInvite",
            data: {
              code,
              expiresAt,
              createdBy: ctx.context.session?.userId,
              metadata: metadata ? JSON.stringify(metadata) : null,
              used: false
            }
          });

          invites.push(invite);
        }

        return ctx.json({
          invites
        });
      }),

      // Analytics dashboard
      getAnalytics: createAuthEndpoint("/waitlist/analytics", {
        method: "GET",
        query: z.object({
          startDate: z.string().datetime(),
          endDate: z.string().datetime(),
        }),
      }, async (ctx) => {
        await validateAdminAccess(ctx, opts);

        const { startDate, endDate } = ctx.query;

        // Get basic stats
        const totalEntries = await ctx.context.internalAdapter.coutn({
          model: "waitlist",
        });

        const pendingEntries = await ctx.context.internalAdapter.count({
          model: "waitlist",
          where: {status: "pending"}
        });

        const approvedEntries = await ctx.context.internalAdapter.count({
          model: "waitlist",
          where: {status: "approved"}
        });

        // Get conversion rate
        const conversionRate = totalEntries > 0 ? (approvedEntries / totalEntries) * 100 : 0;

        // Get recent activity if analytics enabled
        let recentActivity = [];
        if (opts.enableAnalytics) {
          const whereClause: any = {};
          if(startDate) whereClause.timestamp = { gte: new Date(startDate) };
          if(endDate) whereClause.timestamp = { ...whereClause.timestamp, lte: new Date(endDate) };

          recentActivity = await ctx.context.internalAdapter.findMany({
            model: "waitlistAnalytics",
            where: whereClause,
            limit: 100,
            orderBy: {timestamp: "desc"}
          });
        }

        return ctx.json({
          stats: {
            total: totalEntries,
            pending: pendingEntries,
            approved: approvedEntries,
            rejected: totalEntries - pendingEntries - approvedEntries,
            conversionRata: Math.round(conversionRate * 100) / 100,
          },
          recentActivity,
        });
      }),

      // Export waitlist data
      exportData: createAuthEndpoint("/waitlist/export", {
        method: "GET",
        query: z.object({
          format: z.enum(["csv", "json"]).default("json"),
          status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
        }),
      }, async (ctx) => {
        await validateAdminAccess(ctx, opts);

        const { format, status } = ctx.query;
        const whereClause = status !== "all"? {status} : {};
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
            }
          });
        }

        return ctx.json({
          entries,
        });
      }),
    },

    // Hooks for signup interception
    hooks: {
      before: [
        { 
          matcher: (context) => context.path.startWiht("/sign-up"),
          handler: createAuthMiddleware(async (ctx) => {
            const { email } = ctx.body;

            const waitlistEntry = await ctx.context.internalAdapter.findOne({
              model: "waitlist",
              where: {email}
            });

            if (!waitlistEntry) {
              throw new APIError("FORBIDDEN", {
                message: WAITLIST_ERROR_CODES.JOIN_THE_WAITLIST_FIRST,
                code: "WAITLIST_REQUIRED"
              });
            }

            if (waitlistEntry.status !== "approved") {
              throw new APIError("FORBIDDEN", {
                message: `Your waitlist status is: ${waitlistEntry.status}`,
                code: "WAITLIST_NOTO_APPROVED",
              });
            }
          })
        }
      ]
    },

    // Rate limiting
    rateLimit: opts.rateLimit.enabled? [
      {
        pathMatcher: (path) => path.startsWith("/waitlist/"),
        window: opts.rateLimit.window,
        max: opts.rateLimit.max,
      }
    ]: undefined,

    // Erros codes
    $ERROR_CODES: WAITLIST_ERROR_CODES,
  
  } satisfies BetterAuthPlugin;
};


// Helper functions  
async function validateAdminAccess(ctx: any, opts: WaitlistOptions) {  
  const session = ctx.context.session;  
  if (!session) {  
    throw new APIError("UNAUTHORIZED", {  
      message: "Authentication required",  
    });  
  }  
    
  const user = await ctx.context.internalAdapter.findUserById(session.userId);  
  const isAdmin = opts.adminUserIds?.includes(session.userId) ||  
                  opts.adminRoles?.includes(user?.role);  
    
  if (!isAdmin) {  
    throw new APIError("FORBIDDEN", {  
      message: WAITLIST_ERROR_CODES.UNAUTHORIZED_ADMIN,  
    });  
  }  
}  
  
function calculateEstimatedWaitTime(position: number): string {  
  // Simple estimation: assume 10 approvals per day  
  const daysToApproval = Math.ceil(position / 10);  
  return `${daysToApproval} day${daysToApproval !== 1 ? 's' : ''}`;  
}  
  
function convertToCSV(data: any[]): string {  
  if (data.length === 0) return '';  
    
  const headers = Object.keys(data[0]);  
  const csvContent = [  
    headers.join(','),  
    ...data.map(row => headers.map(header =>   
      JSON.stringify(row[header] || '')  
    ).join(','))  
  ].join('\n');  