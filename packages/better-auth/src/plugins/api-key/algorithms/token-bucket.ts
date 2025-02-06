
// export function initiateTokenBucket({}:{}){

//     return async function tokenBucket(
//         apiKeyId: string,
//         userId: string | null,
//         ownerId: string | null,
//     ): Promise<boolean> {
//         const now = Date.now();
//         const tokens = this.tokens.get(apiKeyId) || this.limit; // Start with full bucket
//         const lastRefill = this.lastRefill.get(apiKeyId) || now;
    
//         // Refill tokens based on elapsed time
//         const elapsed = now - lastRefill;
//         const refillTokens = Math.floor(elapsed / (this.window / this.limit));
//         const newTokens = Math.min(this.limit, tokens + refillTokens);
//         this.tokens.set(apiKeyId, newTokens);
//         this.lastRefill.set(apiKeyId, now);
    
//         if (newTokens > 0) {
//             this.tokens.set(apiKeyId, newTokens - 1);
//             await this.updateRateLimit(apiKeyId, userId, ownerId);
//             return true;
//         }
    
//         return false; // Rate limit exceeded
//     }
    
// }