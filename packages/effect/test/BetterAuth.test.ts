import { describe, it, expect } from "vitest";
import { Effect, Layer, Exit } from "effect";
import {
  BetterAuth,
  layer,
  layerFromAuth,
  CurrentUser,
  CurrentSession,
  AuthSession,
  OptionalUser,
  Unauthorized,
  InvalidCredentials,
  EmailAlreadyExists,
} from "../src/index.js";

describe("@better-auth/effect", () => {
  describe("Errors", () => {
    it("should create Unauthorized error with correct structure", () => {
      const error = new Unauthorized({ message: "Not authenticated" });
      expect(error._tag).toBe("Unauthorized");
      expect(error.message).toBe("Not authenticated");
    });

    it("should create InvalidCredentials error with correct structure", () => {
      const error = new InvalidCredentials({ message: "Wrong password" });
      expect(error._tag).toBe("InvalidCredentials");
      expect(error.message).toBe("Wrong password");
    });

    it("should create EmailAlreadyExists error with correct structure", () => {
      const error = new EmailAlreadyExists({ message: "Email taken" });
      expect(error._tag).toBe("EmailAlreadyExists");
      expect(error.message).toBe("Email taken");
    });
  });

  describe("Context Tags", () => {
    it("CurrentUser should have correct service identifier", () => {
      expect(CurrentUser.key).toBe("@better-auth/effect/CurrentUser");
    });

    it("CurrentSession should have correct service identifier", () => {
      expect(CurrentSession.key).toBe("@better-auth/effect/CurrentSession");
    });

    it("AuthSession should have correct service identifier", () => {
      expect(AuthSession.key).toBe("@better-auth/effect/AuthSession");
    });

    it("OptionalUser should have correct service identifier", () => {
      expect(OptionalUser.key).toBe("@better-auth/effect/OptionalUser");
    });

    it("BetterAuth should have correct service identifier", () => {
      expect(BetterAuth.key).toBe("@better-auth/effect/BetterAuth");
    });
  });

  describe("Layer", () => {
    it("should export layer function", () => {
      expect(typeof layer).toBe("function");
    });

    it("should export layerFromAuth function", () => {
      expect(typeof layerFromAuth).toBe("function");
    });
  });

  describe("Effect Integration", () => {
    it("should fail with Unauthorized when accessing CurrentUser without provider", async () => {
      const program = Effect.gen(function* () {
        return yield* CurrentUser;
      });

      const exit = await Effect.runPromiseExit(program);
      expect(Exit.isFailure(exit)).toBe(true);
    });

    it("should work with provided CurrentUser context", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const program = Effect.gen(function* () {
        return yield* CurrentUser;
      });

      const result = await program.pipe(
        Effect.provideService(CurrentUser, mockUser),
        Effect.runPromise
      );

      expect(result.id).toBe("user-123");
      expect(result.email).toBe("test@example.com");
    });

    it("should work with OptionalUser returning undefined", async () => {
      const program = Effect.gen(function* () {
        return yield* OptionalUser;
      });

      const result = await program.pipe(
        Effect.provideService(OptionalUser, undefined),
        Effect.runPromise
      );

      expect(result).toBeUndefined();
    });

    it("should work with OptionalUser returning user", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const program = Effect.gen(function* () {
        return yield* OptionalUser;
      });

      const result = await program.pipe(
        Effect.provideService(OptionalUser, mockUser),
        Effect.runPromise
      );

      expect(result?.id).toBe("user-123");
    });
  });
});
