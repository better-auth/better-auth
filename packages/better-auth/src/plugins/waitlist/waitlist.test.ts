import { describe, expect, it, beforeAll, afterAll } from "vitest";  
import { getTestInstance } from "../../test-utils/test-instance";  
import { waitlist } from "./index";  
import { waitlistClient } from "./client";  
  
describe("waitlist plugin", async () => {  
  let testInstance: any;  
    
  beforeAll(async () => {  
    testInstance = await getTestInstance({  
      plugins: [  
        waitlist({  
          adminUserIds: ["admin-user-id"],  
          maxWaitlistSize: 100,  
          enableAnalytics: true,  
        })  
      ]  
    }, {  
      clientOptions: {  
        plugins: [waitlistClient()]  
      }  
    });  
  });  
  
  it("should allow users to join waitlist", async () => {  
    const { client } = testInstance;  
      
    const result = await client.joinWaitlist({  
      email: "test@example.com",  
      name: "Test User"  
    });  
      
    expect(result.data?.success).toBe(true);  
    expect(result.data?.position).toBe(1);  
    expect(result.data?.status).toBe("pending");  
  });  
  
  it("should prevent duplicate waitlist entries", async () => {  
    const { client } = testInstance;  
      
    // First join should succeed  
    await client.joinWaitlist({  
      email: "duplicate@example.com",  
      name: "Duplicate User"  
    });  
      
    // Second join should fail  
    const result = await client.joinWaitlist({  
      email: "duplicate@example.com",  
      name: "Duplicate User"  
    });  
      
    expect(result.error?.status).toBe(409);  
  });  
  
  it("should allow admin to approve waitlist entries", async () => {  
    const { client, signInWithTestUser } = testInstance;  
      
    // Join waitlist first  
    await client.joinWaitlist({  
      email: "approve@example.com",  
      name: "Approve User"  
    });  
      
    // Sign in as admin  
    const { headers } = await signInWithTestUser("admin-user-id");  
      
    // Approve the entry  
    const result = await client.approveWaitlist(  
      { email: "approve@example.com" },  
      { headers }  
    );  
      
    expect(result.data?.success).toBe(true);  
  });  
  
  it("should enforce waitlist approval before signup", async () => {  
    const { client } = testInstance;  
      
    // Try to sign up without being on waitlist  
    const result = await client.signUp.email({  
      email: "notapproved@example.com",  
      password: "password123",  
      name: "Not Approved"  
    });  
      
    expect(result.error?.status).toBe(403);  
    expect(result.error?.message).toContain("waitlist");  
  });  
  
  it("should generate and validate invite codes", async () => {  
    const { client, signInWithTestUser } = testInstance;  
      
    // Sign in as admin  
    const { headers } = await signInWithTestUser("admin-user-id");  
      
    // Generate invite codes  
    const inviteResult = await client.generateInvites(  
      { count: 5, expiresIn: 3600 },  
      { headers }  
    );  
      
    expect(inviteResult.data?.invites).toHaveLength(5);  
      
    const inviteCode = inviteResult.data.invites[0].code;  
      
    // Use invite code to join waitlist  
    const joinResult = await client.joinWaitlist({  
      email: "invited@example.com",  
      name: "Invited User",  
      inviteCode  
    });  
      
    expect(joinResult.data?.success).toBe(true);  
  });  
  
  it("should provide analytics data", async () => {  
    const { client, signInWithTestUser } = testInstance;  
      
    // Sign in as admin  
    const { headers } = await signInWithTestUser("admin-user-id");  
      
    // Get analytics  
    const result = await client.getAnalytics({}, { headers });  
      
    expect(result.data?.stats).toBeDefined();  
    expect(result.data?.stats.total).toBeGreaterThan(0);  
    expect(result.data?.recentActivity).toBeDefined();  
  });  
  
  it("should export waitlist data", async () => {  
    const { client, signInWithTestUser } = testInstance;  
      
    // Sign in as admin  
    const { headers } = await signInWithTestUser("admin-user-id");  
      
    // Export as JSON  
    const jsonResult = await client.exportWaitlist(  
      { format: "json", status: "all" },  
      { headers }  
    );  
      
    expect(jsonResult.data?.entries).toBeDefined();  
    expect(Array.isArray(jsonResult.data.entries)).toBe(true);  
  });  
  
  it("should handle bulk approval", async () => {  
    const { client, signInWithTestUser } = testInstance;  
      
    // Add multiple users to waitlist  
    const emails = ["bulk1@example.com", "bulk2@example.com", "bulk3@example.com"];  
      
    for (const email of emails) {  
      await client.joinWaitlist({  
        email,  
        name: `Bulk User ${email}`  
      });  
    }  
      
    // Sign in as admin  
    const { headers } = await signInWithTestUser("admin-user-id");  
      
    // Bulk approve  
    const result = await client.bulkApprove(  
      { emails, sendNotifications: false },  
      { headers }  
    );  
      
    expect(result.data?.results).toHaveLength(3);  
    expect(result.data.results.every(r => r.success)).toBe(true);  
  });  
  
  it("should respect rate limiting", async () => {  
    const { client } = testInstance;  
      
    // Make multiple rapid requests  
    const promises = Array.from({ length: 10 }, (_, i) =>  
      client.joinWaitlist({  
        email: `ratelimit${i}@example.com`,  
        name: `Rate Limit User ${i}`  
      })  
    );  
      
    const results = await Promise.allSettled(promises);  
      
    // Some requests should be rate limited  
    const rateLimitedResults = results.filter(  
      result => result.status === 'fulfilled' &&   
      result.value.error?.status === 429  
    );  
      
    expect(rateLimitedResults.length).toBeGreaterThan(0);  
  });  
});