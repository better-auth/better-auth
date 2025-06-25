import { WorkOS } from "@workos-inc/node";
import { auth } from "../src/lib/auth";
import { generateRandomString, symmetricEncrypt } from "better-auth/crypto";
import { sleep } from "better-auth/utils";

// Type definitions for WorkOS responses
interface WorkOSListResponse<T> {
  data: T[];
  listMetadata: {
    before: string | null;
    after: string | null;
  };
}

interface WorkOSUser {
  object: "user";
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
  externalId: string | null;
  metadata: Record<string, any>;
}

interface WorkOSAuthFactor {
  object: "authentication_factor";
  id: string;
  type: "totp" | "sms" | "email";
  createdAt: string;
  updatedAt: string;
  totp_configuration?: {
    qr_code: string;
    secret: string;
  };
  sms_configuration?: {
    phoneNumber: string;
  };
  email_configuration?: {
    email: string;
    hashedPassword?: string;
  };
}

// Validate environment variables
if (!process.env.WORKOS_API_KEY || !process.env.WORKOS_CLIENT_ID) {
  throw new Error("Missing required environment variables WORKOS_API_KEY and/or WORKOS_CLIENT_ID");
}

const workos = new WorkOS(process.env.WORKOS_API_KEY);

// Helper function for safe date conversion
const safeDateConversion = (date: string | number | null | undefined) => {
  if (!date) return new Date();
  try {
    const converted = new Date(date);
    if (isNaN(converted.getTime())) {
      console.warn(`Invalid date: ${date}, using current date`);
      return new Date();
    }
    return converted;
  } catch (error) {
    console.warn(`Error converting date: ${date}, using current date`);
    return new Date();
  }
};

// Helper function to generate backup codes for 2FA
async function generateBackupCodes(secret: string) {
  const backupCodes = Array.from({ length: 10 })
    .fill(null)
    .map(() => generateRandomString(10, "a-z", "0-9", "A-Z"))
    .map((code) => `${code.slice(0, 5)}-${code.slice(5)}`);

  const encCodes = await symmetricEncrypt({
    data: JSON.stringify(backupCodes),
    key: secret,
  });
  return encCodes;
}

// Retry helper function
async function retry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxRetries) break;
      
      console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
      await sleep(delay);
      delay *= 2; // Exponential backoff
    }
  }
  
  throw lastError;
}

// Helper function to migrate a single user
async function migrateUser(workosUser: WorkOSUser, ctx: any) {
  console.log(`\nProcessing user: ${workosUser.email}`);

  // Get user's authentication factors
  const authFactorsResponse = await retry(() => 
    workos.userManagement.listAuthFactors({
      userId: workosUser.id,
    }) as Promise<WorkOSListResponse<WorkOSAuthFactor>>
  );
  
  const authFactors = authFactorsResponse.data;
  console.log(`Found ${authFactors.length} auth factors`);

  // Create the user
  const createdUser = await retry(() => 
    ctx.adapter.create({
      model: "user",
      data: {
        id: workosUser.id,
        email: workosUser.email,
        emailVerified: workosUser.emailVerified,
        name: `${workosUser.firstName || ''} ${workosUser.lastName || ''}`.trim() || workosUser.email,
        image: workosUser.profilePictureUrl,
        createdAt: safeDateConversion(workosUser.createdAt),
        updatedAt: safeDateConversion(workosUser.updatedAt),
        role: "user",
        banned: false,
        twoFactorEnabled: authFactors.some(f => f.type === "totp"),
        username: workosUser.email.split("@")[0],
        phoneNumber: authFactors.find(f => f.type === "sms")?.sms_configuration?.phoneNumber,
        phoneNumberVerified: !!authFactors.find(f => f.type === "sms"),
        metadata: workosUser.metadata // Preserve WorkOS metadata
      },
      forceAllowId: true
    })
  );

  // Migrate email/password credentials
  const emailFactor = authFactors.find(f => f.type === "email" && f.email_configuration?.hashedPassword);
  if (emailFactor?.email_configuration?.hashedPassword) {
    await retry(() => 
      ctx.adapter.create({
        model: "account",
        data: {
          userId: createdUser.id,
          type: "credentials",
          provider: "credentials",
          providerAccountId: workosUser.id,
          password: emailFactor.email_configuration.hashedPassword,
          createdAt: safeDateConversion(emailFactor.createdAt),
          updatedAt: safeDateConversion(emailFactor.updatedAt)
        },
        forceAllowId: true
      })
    );
    console.log('Migrated email/password credentials');
  }
  
  // Migrate OAuth connections
  try {
    const connections = await retry(() => 
      workos.sso.listConnections({
        userId: workosUser.id
      })
    );

    for (const connection of connections.data) {
      await retry(() => 
        ctx.adapter.create({
          model: "account",
          data: {
            userId: createdUser.id,
            type: "oauth",
            provider: connection.connectionType.toLowerCase(),
            providerAccountId: connection.id,
            createdAt: safeDateConversion(connection.createdAt),
            updatedAt: safeDateConversion(connection.updatedAt),
            scope: connection.domains.join(' ')
          },
          forceAllowId: true
        })
      );
      console.log(`Migrated ${connection.connectionType} OAuth connection`);
    }
  } catch (error) {
    console.warn(`Failed to migrate OAuth connections for user ${workosUser.email}:`, error);
  }

  // Migrate 2FA settings
  for (const factor of authFactors) {
    if (factor.type === "totp" && factor.totp_configuration?.secret) {
      await retry(() => 
        ctx.adapter.create({
          model: "twoFactor",
          data: {
            userId: createdUser.id,
            secret: factor.totp_configuration.secret,
            backupCodes: await generateBackupCodes(factor.totp_configuration.secret)
          },
          forceAllowId: true
        })
      );
      console.log('Migrated 2FA settings');
    }
  }

  return createdUser;
}

// Main migration function
async function migrateFromWorkOS() {
  const ctx = await auth.$context;
  let totalUsers = 0;
  let migratedUsers = 0;
  let failedUsers = 0;
  const failedUserIds: string[] = [];

  let hasMoreUsers = true;
  let before: string | undefined;
  const limit = 100;

  console.log('Starting WorkOS migration...');
  console.time('Migration Duration');

  try {
    while (hasMoreUsers) {
      const response = await retry(() => 
        workos.userManagement.listUsers({
          limit,
          before,
        }) as Promise<WorkOSListResponse<WorkOSUser>>
      );
      
      const workosUsers = response.data;
      console.log(`\nFetched ${workosUsers.length} users`);

      before = response.listMetadata.before || undefined;
      hasMoreUsers = workosUsers.length === limit;
      totalUsers += workosUsers.length;

      for (const workosUser of workosUsers) {
        try {
          await migrateUser(workosUser, ctx);
          migratedUsers++;
          console.log(`Successfully migrated user: ${workosUser.email}`);
        } catch (error) {
          console.error(`Failed to migrate user ${workosUser.email}:`, error);
          failedUsers++;
          failedUserIds.push(workosUser.id);
        }
      }

      // Progress update
      console.log(`\nProgress: ${migratedUsers}/${totalUsers} users migrated`);
    }
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    console.timeEnd('Migration Duration');
    
    console.log(`
Migration Summary:
----------------
Total Users: ${totalUsers}
Successfully Migrated: ${migratedUsers}
Failed: ${failedUsers}
Success Rate: ${((migratedUsers / totalUsers) * 100).toFixed(2)}%

${failedUsers > 0 ? `Failed User IDs: ${failedUserIds.join(', ')}` : ''}
    `);
  }
}

// Run the migration
migrateFromWorkOS()
  .catch(console.error)
  .finally(() => process.exit()); 