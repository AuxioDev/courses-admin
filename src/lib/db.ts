import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  // pg reads sslmode=require/prefer/verify-ca as verify-full and logs a warning that this changes in pg v9.
  // Saying verify-full is the same behaviour without the warning on every cold start.
  const connectionString = process.env.DATABASE_URL?.replace(/([?&]sslmode=)(?:require|prefer|verify-ca)\b/, "$1verify-full");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
