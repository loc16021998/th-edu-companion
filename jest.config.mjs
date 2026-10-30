import nextJest from "next/jest.js";

// Biên dịch TypeScript bằng SWC giống Next.js (không cần ts-jest / ts-node)
const createJestConfig = nextJest({ dir: "./" });

/** @type {import("jest").Config} */
const config = {
  testEnvironment: "node",
  roots: ["<rootDir>/tests/unit"],
  // Biến Supabase giả — unit test không bao giờ gọi Supabase thật
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Package "server-only" chặn import ngoài React Server Components → thay bằng module rỗng khi test
    "^server-only$": "<rootDir>/tests/stubs/empty.ts",
  },
  clearMocks: true,
};

export default createJestConfig(config);
