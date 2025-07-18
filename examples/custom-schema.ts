import { z } from "zod";
import { betterAuth } from "better-auth";

// Example 1: Basic custom user schema
const basicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["admin", "user", "moderator"]),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const basicAuth = betterAuth({
  database: {
    provider: "sqlite",
    url: "./basic-db.sqlite",
  },
  user: {
    schema: basicUserSchema,
  },
});

// TypeScript will now infer the correct user type
type BasicUser = typeof basicAuth.$Infer.Session.user;
// BasicUser will have: id, email, name, role, createdAt, updatedAt

// Example 2: Advanced custom user schema with optional fields
const advancedUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string().min(3).max(30),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["admin", "user", "moderator", "guest"]).default("user"),
  organizationId: z.string().optional(),
  isActive: z.boolean().default(true),
  preferences: z.object({
    theme: z.enum(["light", "dark", "auto"]).default("auto"),
    language: z.string().default("en"),
    notifications: z.boolean().default(true),
  }).default({}),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const advancedAuth = betterAuth({
  database: {
    provider: "postgresql",
    url: process.env.DATABASE_URL!,
  },
  user: {
    schema: advancedUserSchema,
  },
});

// TypeScript inference for advanced schema
type AdvancedUser = typeof advancedAuth.$Infer.Session.user;
// AdvancedUser will have all the fields from advancedUserSchema

// Example 3: Custom schema with validation and transformation
const validatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().transform(val => val.toLowerCase()),
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be less than 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, underscores, and hyphens"),
  age: z.number().min(13, "Must be at least 13 years old").max(120, "Invalid age"),
  phoneNumber: z.string().regex(/^\+?[\d\s\-\(\)]+$/, "Invalid phone number").optional(),
  profile: z.object({
    bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
    avatar: z.string().url("Invalid avatar URL").optional(),
    website: z.string().url("Invalid website URL").optional(),
  }).optional(),
  settings: z.object({
    emailNotifications: z.boolean().default(true),
    pushNotifications: z.boolean().default(false),
    twoFactorEnabled: z.boolean().default(false),
    privacyLevel: z.enum(["public", "private", "friends"]).default("public"),
  }).default({}),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const validatedAuth = betterAuth({
  database: {
    provider: "mysql",
    url: process.env.MYSQL_URL!,
  },
  user: {
    schema: validatedUserSchema,
  },
});

// Example 4: Using custom schema with social providers
const socialUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatar: z.string().url().optional(),
  provider: z.enum(["google", "github", "discord", "email"]),
  providerId: z.string().optional(), // For OAuth providers
  locale: z.string().default("en"),
  timezone: z.string().default("UTC"),
  lastLoginAt: z.date().optional(),
  loginCount: z.number().default(0),
  isVerified: z.boolean().default(false),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const socialAuth = betterAuth({
  database: {
    provider: "sqlite",
    url: "./social-db.sqlite",
  },
  user: {
    schema: socialUserSchema,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      mapProfileToUser: (profile) => ({
        provider: "google" as const,
        providerId: profile.sub,
        avatar: profile.picture,
        locale: profile.locale,
      }),
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      mapProfileToUser: (profile) => ({
        provider: "github" as const,
        providerId: profile.id.toString(),
        avatar: profile.avatar_url,
      }),
    },
  },
});

// Example 5: Enterprise schema with organization support
const enterpriseUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  employeeId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string().optional(),
  department: z.string().optional(),
  position: z.string().optional(),
  managerId: z.string().uuid().optional(),
  organizationId: z.string().uuid(),
  permissions: z.array(z.string()).default([]),
  roles: z.array(z.enum(["admin", "manager", "employee", "viewer"])).default(["employee"]),
  status: z.enum(["active", "inactive", "suspended", "pending"]).default("pending"),
  hireDate: z.date().optional(),
  terminationDate: z.date().optional(),
  salary: z.number().positive().optional(),
  workLocation: z.enum(["office", "remote", "hybrid"]).default("office"),
  emergencyContact: z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
    email: z.string().email().optional(),
  }).optional(),
  createdAt: z.date().default(() => new Date()),
  updatedAt: z.date().default(() => new Date()),
});

export const enterpriseAuth = betterAuth({
  database: {
    provider: "postgresql",
    url: process.env.ENTERPRISE_DB_URL!,
  },
  user: {
    schema: enterpriseUserSchema,
  },
});

// Usage examples:

// 1. Type-safe user creation
async function createUser() {
  const result = await basicAuth.api.signUpEmail({
    email: "user@example.com",
    password: "securepassword123",
    name: "John Doe",
    role: "user", // TypeScript will ensure this is "admin" | "user" | "moderator"
  });
  
  // result.user will have the correct type with all fields from basicUserSchema
  console.log(result.user.role); // TypeScript knows this is "admin" | "user" | "moderator"
}

// 2. Type-safe user updates
async function updateUser(userId: string) {
  const result = await advancedAuth.api.updateUser({
    id: userId,
    firstName: "Jane",
    lastName: "Smith",
    preferences: {
      theme: "dark",
      language: "es",
      notifications: false,
    },
  });
  
  // TypeScript will ensure all fields match the schema
  console.log(result.user.preferences.theme); // "light" | "dark" | "auto"
}

// 3. Type-safe session access
async function getUserProfile(session: typeof advancedAuth.$Infer.Session) {
  // session.user has full type safety
  const user = session.user;
  
  if (user.role === "admin") {
    // TypeScript knows user.role is "admin" in this branch
    console.log("Admin user:", user.username);
  }
  
  // Access nested objects with full type safety
  console.log(user.preferences.theme);
  console.log(user.preferences.language);
}

// 4. Working with enterprise users
async function processEmployee(user: typeof enterpriseAuth.$Infer.Session.user) {
  if (user.status === "active" && user.roles.includes("manager")) {
    // TypeScript ensures type safety for all fields
    console.log(`Manager ${user.firstName} ${user.lastName} manages department ${user.department}`);
  }
  
  // Type-safe access to optional fields
  if (user.emergencyContact) {
    console.log(`Emergency contact: ${user.emergencyContact.name} (${user.emergencyContact.phone})`);
  }
}

// Export types for use in other parts of the application
export type BasicUserType = typeof basicAuth.$Infer.Session.user;
export type AdvancedUserType = typeof advancedAuth.$Infer.Session.user;
export type ValidatedUserType = typeof validatedAuth.$Infer.Session.user;
export type SocialUserType = typeof socialAuth.$Infer.Session.user;
export type EnterpriseUserType = typeof enterpriseAuth.$Infer.Session.user; 