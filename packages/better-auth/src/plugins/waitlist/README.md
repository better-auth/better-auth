# 🎯 Waitlist Plugin for Better Auth

A comprehensive, production-ready waitlist management plugin for Better Auth with advanced features for queue management, analytics, priority handling, referral systems, and administrative controls.

## ✨ Features

### 🚀 Core Functionality
- **Intelligent Queue Management** - Automatic position tracking with smart rebalancing
- **Multi-level Priority System** - Four priority levels: `low`, `normal`, `high`, `urgent`
- **Flexible Capacity Controls** - Set maximum waitlist size with overflow handling
- **Email Uniqueness** - Prevents duplicate entries based on email addresses
- **User Association** - Link waitlist entries to authenticated users
- **Status Management** - Six status types: `pending`, `approved`, `rejected`, `invited`, `expired`, `converted`

### 📊 Advanced Analytics & Tracking
- **Comprehensive Analytics** - Track signups, conversions, wait times, and performance metrics
- **Source Attribution** - Monitor traffic sources and UTM parameters
- **Campaign Management** - Create and track different waitlist campaigns
- **Daily Metrics** - Historical signup data with trend analysis
- **Priority Distribution** - Understand user priority patterns
- **Conversion Tracking** - Monitor approval rates and user conversion

### 👑 Administrative Features
- **Bulk Operations** - Approve, reject, or update priority for multiple entries at once
- **Data Export** - Export waitlist data in CSV or JSON formats with filtering
- **Advanced Filtering** - Filter by status, priority, date ranges, campaigns, and more
- **User Search** - Find entries by email or name
- **Position Management** - Manual position adjustments and rebalancing
- **Audit Trail** - Track all administrative actions with timestamps

### 🔗 Enterprise Features
- **Referral System** - Reward users for referring others with priority boosts or position skips
- **Campaign Support** - Separate waitlists for different campaigns or products
- **Auto-cleanup** - Automatically remove expired entries based on configurable rules
- **Metadata Support** - Store custom data with each entry for advanced tracking
- **Estimated Wait Time** - Calculate and display estimated wait times to users

## 📦 Installation

```bash
npm install better-auth
```

## 🚀 Quick Start

### Server Setup

```typescript
import { betterAuth } from "better-auth"
import { waitlist } from "better-auth/plugins"

const auth = betterAuth({
  database: yourDatabase,
  plugins: [
    waitlist({
      // Basic configuration
      maxCapacity: 1000,
      
      // Analytics configuration
      analytics: {
        enabled: true,
        trackSources: true,
        trackCampaigns: true,
        retentionPeriodDays: 365
      },
      
      // Event hooks for custom logic
      onUserJoined: async ({ entry, position, totalCount, context }) => {
        console.log(`${entry.email} joined at position ${position} of ${totalCount}`);
        // Send welcome email with your email service
      },
      
      onUserApproved: async ({ entry, approvedBy, context }) => {
        console.log(`${entry.email} approved by ${approvedBy?.email}`);
        // Send approval email and grant access
      },
      
      // Admin authorization
      isAdmin: (context, user) => user.role === "admin"
    })
  ]
})
```

### Client Setup

```typescript
import { createAuthClient } from "better-auth/client"
import { waitlistClient } from "better-auth/plugins/client"

const client = createAuthClient({
  baseURL: "http://localhost:3000",
  plugins: [waitlistClient()]
})
```

## 🎯 Complete Usage Guide

### Basic User Operations

#### Join Waitlist
```typescript
// Basic join
const result = await client.waitlist.join({
  email: "user@example.com",
  name: "John Doe"
})

// Join with tracking metadata
const result = await client.waitlist.join({
  email: "user@example.com",
  name: "John Doe",
  metadata: { 
    source: "landing-page",
    utm_campaign: "launch",
    browser: "chrome",
    country: "US"
  },
  source: "twitter",
  campaign: "early-access",
  referralCode: "FRIEND123"
})

console.log(result)
// Output:
{
  data: {
    entry: {
      id: "wl_123",
      email: "user@example.com",
      name: "John Doe",
      position: 1,
      status: "pending",
      priority: "normal",
      joinedAt: "2024-01-15T10:30:00Z",
      referralCode: "USER456"
    },
    position: 1,
    totalCount: 1,
    estimatedWaitTime: 14 // days
  },
  error: null
}
```

#### Check Status
```typescript
// Check your status
const status = await client.waitlist.getStatus({
  email: "user@example.com"
})

console.log(status)
// Output:
{
  data: {
    entry: {
      id: "wl_123",
      position: 1,
      status: "pending",
      priority: "normal",
      joinedAt: "2024-01-15T10:30:00Z",
      estimatedWaitTime: 14
    },
    position: 1,
    totalCount: 247,
    estimatedWaitTime: 14
  },
  error: null
}
```

#### Leave Waitlist
```typescript
await client.waitlist.leave({
  email: "user@example.com"
})
```

### Administrative Operations

#### Get All Entries with Filtering
```typescript
// Get all pending entries
const entries = await client.waitlist.admin.getWaitlist({
  status: "pending",
  limit: 50,
  offset: 0,
  sortBy: "position",
  sortOrder: "asc"
})

// Advanced filtering
const filteredEntries = await client.waitlist.admin.getWaitlist({
  status: "pending",
  priority: "high",
  dateRange: {
    start: new Date("2024-01-01"),
    end: new Date("2024-01-31")
  },
  source: "twitter",
  campaign: "early-access",
  search: "john" // search by name or email
})
```

#### Bulk Operations
```typescript
// Bulk approve users
const result = await client.waitlist.admin.bulkUpdate({
  action: "approve",
  ids: ["wl_123", "wl_456", "wl_789"],
  reason: "Early access granted for beta testers"
})

// Bulk update priority
await client.waitlist.admin.bulkUpdate({
  action: "update_priority",
  ids: ["wl_123", "wl_456"],
  priority: "high",
  reason: "VIP users"
})

// Bulk reject
await client.waitlist.admin.bulkUpdate({
  action: "reject",
  ids: ["wl_999"],
  reason: "Invalid email domain"
})
```

#### Analytics & Insights
```typescript
// Get comprehensive analytics
const analytics = await client.waitlist.admin.getAnalytics({
  period: "30d"
})

console.log(analytics)
// Output:
{
  data: {
    totalEntries: 1247,
    pendingCount: 892,
    approvedCount: 245,
    rejectedCount: 67,
    convertedCount: 43,
    conversionRate: 0.175, // 17.5%
    averageWaitTime: 14.5, // days
    dailySignups: [
      { date: "2024-01-01", count: 23 },
      { date: "2024-01-02", count: 31 },
      // ... more daily data
    ],
    topSources: [
      { source: "twitter", count: 412 },
      { source: "landing-page", count: 298 },
      { source: "reddit", count: 156 }
    ],
    priorityDistribution: {
      urgent: 12,
      high: 89,
      normal: 743,
      low: 403
    },
    campaignPerformance: [
      { campaign: "early-access", signups: 523, conversions: 91 },
      { campaign: "beta-launch", signups: 289, conversions: 45 }
    ]
  },
  error: null
}
```

#### Data Export
```typescript
// Export to CSV
const csvData = await client.waitlist.admin.export({
  format: "csv",
  status: "pending",
  includeAnalytics: true
})

// Export with filters
const jsonData = await client.waitlist.admin.export({
  format: "json",
  filters: {
    priority: ["high", "urgent"],
    dateRange: {
      start: new Date("2024-01-01"),
      end: new Date("2024-01-31")
    }
  },
  fields: ["email", "name", "position", "status", "joinedAt"],
  includeAnalytics: false
})
```

#### Cleanup Operations
```typescript
// Cleanup expired entries (dry run first)
const dryRunResult = await client.waitlist.admin.cleanup({
  expirationDays: 30,
  dryRun: true
})

console.log(`Would remove ${dryRunResult.data.expiredCount} entries`)

// Actual cleanup
const cleanupResult = await client.waitlist.admin.cleanup({
  expirationDays: 30,
  dryRun: false
})

console.log(`Removed ${cleanupResult.data.expiredCount} expired entries`)
```

## ⚙️ Complete Configuration Reference

### Core Options

```typescript
waitlist({
  /**
   * Maximum number of people allowed on the waitlist.
   * Set to undefined for unlimited capacity.
   * @default undefined
   */
  maxCapacity: 1000,
  
  /**
   * Whether to allow users to join multiple times with different emails.
   * When false, prevents duplicate entries based on user ID.
   * @default false
   */
  allowMultipleEntries: false,
  
  /**
   * Enable automatic cleanup of expired entries.
   * @default false
   */
  enableAutoCleanup: true,
  
  /**
   * Days after which pending entries expire.
   * Only applies when enableAutoCleanup is true.
   * @default 30
   */
  expirationDays: 90
})
```

### Analytics Configuration

```typescript
waitlist({
  analytics: {
    /**
     * Enable analytics tracking.
     * @default true
     */
    enabled: true,
    
    /**
     * Track signup sources (UTM parameters, referrers).
     * @default true
     */
    trackSources: true,
    
    /**
     * Track campaign performance.
     * @default true
     */
    trackCampaigns: true,
    
    /**
     * How long to retain analytics data (in days).
     * @default 365
     */
    retentionPeriodDays: 365
  }
})
```

### Referral System

```typescript
waitlist({
  referral: {
    /**
     * Enable the referral system.
     * @default false
     */
    enabled: true,
    
    /**
     * Type of reward for successful referrals.
     * - "priority": Increases priority level
     * - "skip_positions": Skips a number of positions
     * - "custom": Use custom logic in calculatePriority hook
     */
    rewardType: "skip_positions",
    
    /**
     * Value for the reward (positions to skip or priority boost).
     */
    rewardValue: 3,
    
    /**
     * Maximum number of referrals a user can make.
     * @default undefined (unlimited)
     */
    maxReferrals: 10,
    
    /**
     * Enable tracking of referral performance.
     * @default true
     */
    trackingEnabled: true
  }
})
```

### Campaign System

```typescript
waitlist({
  campaigns: {
    /**
     * Enable campaign support.
     * @default false
     */
    enabled: true,
    
    /**
     * Allow users to create new campaigns.
     * Can be a function to implement custom logic.
     * @default false
     */
    allowUserToCreateCampaign: (user, context) => {
      return user.role === "admin" || user.email.endsWith("@company.com")
    }
  }
})
```

### Event Hooks

```typescript
waitlist({
  /**
   * Called when someone joins the waitlist.
   * Use this to send welcome emails or trigger other actions.
   */
  onUserJoined: async ({ entry, position, totalCount, context }) => {
    // Send welcome email
    await yourEmailService.send({
      to: entry.email,
      subject: `Welcome to our waitlist! You're #${position}`,
      template: "waitlist-welcome",
      data: {
        name: entry.name,
        position,
        totalCount,
        estimatedWaitTime: calculateEstimatedWaitTime(position, totalCount)
      }
    })
    
    // Track in analytics
    await analytics.track("waitlist_joined", {
      email: entry.email,
      position,
      source: entry.source,
      campaign: entry.campaign
    })
    
    // Send Slack notification
    if (totalCount % 100 === 0) {
      await slack.send(`🎉 Milestone reached: ${totalCount} people on waitlist!`)
    }
  },
  
  /**
   * Called when someone leaves the waitlist.
   */
  onUserLeft: async ({ entry, position, context }) => {
    await analytics.track("waitlist_left", {
      email: entry.email,
      position,
      reason: "user_initiated"
    })
  },
  
  /**
   * Called when someone is approved.
   */
  onUserApproved: async ({ entry, approvedBy, context }) => {
    // Send approval email
    await yourEmailService.send({
      to: entry.email,
      subject: "🎉 You've been approved!",
      template: "waitlist-approved",
      data: {
        name: entry.name,
        approvalDate: new Date().toLocaleDateString(),
        accessLink: "https://app.yoursite.com/welcome"
      }
    })
    
    // Grant access to your app
    await grantUserAccess(entry.userId, {
      plan: "beta",
      features: ["all"]
    })
    
    // Update analytics
    await analytics.track("waitlist_approved", {
      email: entry.email,
      approvedBy: approvedBy?.email,
      waitTime: Date.now() - entry.joinedAt.getTime()
    })
  },
  
  /**
   * Called when someone is rejected.
   */
  onUserRejected: async ({ entry, rejectedBy, reason, context }) => {
    // Send rejection email (optional)
    if (reason !== "spam") {
      await yourEmailService.send({
        to: entry.email,
        subject: "Update on your waitlist application",
        template: "waitlist-rejected",
        data: {
          name: entry.name,
          reason: reason || "Application review completed"
        }
      })
    }
    
    // Log for review
    await auditLog.log("waitlist_rejection", {
      email: entry.email,
      rejectedBy: rejectedBy?.email,
      reason
    })
  }
})
```

### Authorization & Priority

```typescript
waitlist({
  /**
   * Custom function to determine if a user can access admin endpoints.
   */
  isAdmin: (context, user) => {
    // Multiple admin criteria
    return user.role === "admin" || 
           user.email.endsWith("@yourcompany.com") ||
           user.permissions?.includes("waitlist_admin")
  },
  
  /**
   * Custom function to determine priority for new entries.
   */
  calculatePriority: async ({ email, metadata, referralCode, context }) => {
    // VIP domains get urgent priority
    if (email.endsWith("@vip-domain.com")) {
      return "urgent"
    }
    
    // Referred users get high priority
    if (referralCode) {
      return "high"
    }
    
    // Premium traffic sources get normal priority
    if (metadata?.source === "twitter" || metadata?.utm_medium === "social") {
      return "normal"
    }
    
    // Check if user is an existing customer
    const existingUser = await yourDatabase.user.findUnique({
      where: { email }
    })
    
    if (existingUser?.subscriptionTier === "premium") {
      return "high"
    }
    
    // Default priority
    return "low"
  }
})
```

## 📋 Complete API Reference

### Client Methods

#### Basic User Methods
- `waitlist.join(data)` - Join the waitlist
- `waitlist.leave(data?)` - Leave the waitlist
- `waitlist.getStatus(params?)` - Get user's waitlist status

#### Admin Methods
- `waitlist.admin.getWaitlist(options?)` - Get filtered waitlist entries
- `waitlist.admin.bulkUpdate(data)` - Perform bulk operations
- `waitlist.admin.getAnalytics(options?)` - Get comprehensive analytics
- `waitlist.admin.export(options?)` - Export waitlist data
- `waitlist.admin.cleanup(options?)` - Clean up expired entries

### Data Types & Interfaces

#### WaitlistEntry
```typescript
interface WaitlistEntry {
  id: string                    // Unique identifier
  email: string                 // User's email (unique)
  name?: string                 // User's display name
  position: number              // Current position in queue
  status: WaitlistStatus        // Current status
  priority: WaitlistPriority    // Priority level
  joinedAt: Date               // When user joined
  updatedAt?: Date             // Last update time
  approvedAt?: Date            // When approved (if applicable)
  rejectedAt?: Date            // When rejected (if applicable)
  metadata?: Record<string, any> // Custom tracking data
  userId?: string              // Associated user ID
  referralCode?: string        // User's referral code
  referredBy?: string          // Who referred this user
  source?: string              // Traffic source
  campaign?: string            // Campaign identifier
}
```

#### Status Types
```typescript
type WaitlistStatus = 
  | "pending"     // Waiting for approval
  | "approved"    // Approved and notified
  | "rejected"    // Rejected by admin
  | "invited"     // Invited but not yet converted
  | "expired"     // Entry expired due to time limit
  | "converted"   // Successfully became a user
```

#### Priority Levels
```typescript
type WaitlistPriority = 
  | "low"         // Default priority
  | "normal"      // Standard priority
  | "high"        // Higher priority (moved up in queue)
  | "urgent"      // Highest priority (processed first)
```

#### Analytics Response
```typescript
interface WaitlistAnalyticsData {
  totalEntries: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
  convertedCount: number
  conversionRate: number       // Percentage of approved users who converted
  averageWaitTime: number      // Average wait time in days
  dailySignups: Array<{
    date: string
    count: number
  }>
  topSources: Array<{
    source: string
    count: number
  }>
  priorityDistribution: Record<WaitlistPriority, number>
  campaignPerformance?: Array<{
    campaign: string
    signups: number
    conversions: number
  }>
}
```

## 🏗️ Database Schema

The plugin automatically creates the following database tables:

### waitlist
```sql
CREATE TABLE waitlist (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  position INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  joinedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME,
  approvedAt DATETIME,
  rejectedAt DATETIME,
  metadata TEXT, -- JSON string
  userId TEXT,
  referralCode TEXT,
  referredBy TEXT,
  source TEXT,
  campaign TEXT,
  
  -- Indexes for performance
  INDEX idx_waitlist_email (email),
  INDEX idx_waitlist_status (status),
  INDEX idx_waitlist_position (position),
  INDEX idx_waitlist_priority (priority),
  INDEX idx_waitlist_campaign (campaign),
  INDEX idx_waitlist_source (source),
  INDEX idx_waitlist_joined_at (joinedAt)
)
```

### waitlist_campaigns (if campaigns enabled)
```sql
CREATE TABLE waitlist_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  startDate DATETIME DEFAULT CURRENT_TIMESTAMP,
  endDate DATETIME,
  maxCapacity INTEGER,
  priority TEXT DEFAULT 'normal',
  metadata TEXT, -- JSON string
  isActive BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME
)
```

### waitlist_analytics (if analytics enabled)
```sql
CREATE TABLE waitlist_analytics (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  totalEntries INTEGER DEFAULT 0,
  pendingCount INTEGER DEFAULT 0,
  approvedCount INTEGER DEFAULT 0,
  rejectedCount INTEGER DEFAULT 0,
  convertedCount INTEGER DEFAULT 0,
  signupsCount INTEGER DEFAULT 0,
  metadata TEXT, -- JSON string for additional metrics
  
  UNIQUE(date)
)
```

## 📈 Best Practices & Production Tips

### 1. Database Optimization

For large waitlists, ensure proper indexing:

```sql
-- Additional recommended indexes for high-traffic scenarios
CREATE INDEX idx_waitlist_status_priority ON waitlist(status, priority);
CREATE INDEX idx_waitlist_joined_campaign ON waitlist(joinedAt, campaign);
CREATE INDEX idx_waitlist_referral ON waitlist(referredBy) WHERE referredBy IS NOT NULL;
```

### 2. Performance Monitoring

Set up monitoring for key metrics:

```typescript
// Example monitoring setup
waitlist({
  onUserJoined: async ({ entry, position, totalCount, context }) => {
    // Monitor signup rate
    await metrics.increment("waitlist.signups", {
      source: entry.source,
      campaign: entry.campaign
    })
    
    // Alert on capacity milestones
    if (totalCount >= 900 && maxCapacity === 1000) {
      await alerts.send("Waitlist nearing capacity", {
        current: totalCount,
        max: maxCapacity
      })
    }
  }
})
```

### 3. Email Delivery Best Practices

```typescript
// Example email implementation with retry logic
const sendWaitlistEmail = async (type: string, entry: WaitlistEntry, data: any) => {
  try {
    await emailService.send({
      to: entry.email,
      subject: getEmailSubject(type, data),
      template: `waitlist-${type}`,
      data: {
        ...data,
        unsubscribeUrl: `https://yoursite.com/unsubscribe?email=${entry.email}`
      }
    })
  } catch (error) {
    // Retry logic
    await retryQueue.add("send-email", {
      type,
      entry,
      data,
      attempt: 1
    }, {
      delay: 5000,
      attempts: 3
    })
  }
}
```

### 4. A/B Testing Integration

```typescript
waitlist({
  onUserJoined: async ({ entry, context }) => {
    // Assign A/B test variant
    const variant = await abTest.assign("waitlist-welcome", entry.email)
    
    await sendWelcomeEmail(entry, {
      variant,
      ctaText: variant === "A" ? "Join Beta" : "Get Early Access"
    })
  }
})
```

### 5. Fraud Prevention

```typescript
waitlist({
  calculatePriority: async ({ email, metadata, context }) => {
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /temp-mail|10minutemail|guerrillamail/i,
      /test\+\d+@/i
    ]
    
    if (suspiciousPatterns.some(pattern => pattern.test(email))) {
      // Flag for manual review
      await flagForReview(email, "suspicious_email_pattern")
      return "low"
    }
    
    // Rate limiting by IP
    const recentSignups = await countRecentSignupsByIP(context.ip)
    if (recentSignups > 5) {
      await flagForReview(email, "rate_limit_exceeded")
      return "low"
    }
    
    return "normal"
  }
})
```

## 🚀 Advanced Use Cases

### 1. Multi-Product Waitlists

```typescript
// Different waitlists for different products
const auth = betterAuth({
  plugins: [
    waitlist({
      campaigns: {
        enabled: true,
        allowUserToCreateCampaign: false
      },
      calculatePriority: ({ campaign }) => {
        if (campaign === "enterprise") return "urgent"
        if (campaign === "pro") return "high"
        return "normal"
      }
    })
  ]
})

// Join specific product waitlist
await client.waitlist.join({
  email: "user@example.com",
  campaign: "enterprise",
  metadata: { company: "BigCorp Inc" }
})
```

### 2. Invitation-Based System

```typescript
waitlist({
  onUserApproved: async ({ entry }) => {
    // Generate invitation token
    const inviteToken = await generateInviteToken(entry.email)
    
    await sendInviteEmail(entry.email, {
      inviteUrl: `https://app.yoursite.com/invite/${inviteToken}`,
      expiresIn: "7 days"
    })
    
    // Update status to invited
    await updateEntryStatus(entry.id, "invited")
  }
})
```

### 3. Geographic Waitlists

```typescript
waitlist({
  calculatePriority: ({ metadata }) => {
    const country = metadata?.country
    
    // Prioritize by market launch order
    if (["US", "CA", "UK"].includes(country)) return "high"
    if (["DE", "FR", "AU"].includes(country)) return "normal"
    return "low"
  },
  
  onUserJoined: async ({ entry, context }) => {
    const country = entry.metadata?.country || "unknown"
    
    await analytics.track("waitlist_joined_by_country", {
      country,
      email: entry.email
    })
  }
})
```

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Report bugs** - Open an issue with detailed reproduction steps
2. **Request features** - Describe your use case and proposed solution
3. **Submit PRs** - Follow our coding standards and include tests
4. **Improve docs** - Help make the documentation clearer and more comprehensive

### Development Setup

```bash
# Clone the repository
git clone https://github.com/better-auth/better-auth.git

# Install dependencies
pnpm install

# Run tests
pnpm test waitlist

# Build the plugin
pnpm build
```

## 📄 License

This plugin is part of Better Auth and follows the same license terms.

---

## 🆘 Need Help?

- 📖 **Documentation**: [https://better-auth.com/docs/plugins/waitlist](https://better-auth.com/docs/plugins/waitlist)
- 💬 **Discord**: Join our Discord community for real-time help
- 🐛 **Issues**: Report bugs on GitHub
- 💡 **Feature Requests**: Suggest new features via GitHub discussions

---

**Made with ❤️ by the Better Auth team** 