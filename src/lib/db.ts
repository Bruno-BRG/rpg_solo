/**
 * Prisma client singleton.
 *
 * Next.js hot-reloads modules in development; without caching,
 * each reload would open a new connection pool. The global
 * assignment pattern is the recommended workaround.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
