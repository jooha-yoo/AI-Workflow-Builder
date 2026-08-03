import { PrismaClient } from "@prisma/client";

// Cache the client on the global object in dev so Next's hot-reload doesn't
// create a fresh PrismaClient (and a fresh DB connection pool) on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
