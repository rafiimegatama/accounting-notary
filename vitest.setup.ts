// Points every test at the disposable test database (see
// scripts/reset-test-db.sh) instead of the dev database — must run before
// src/lib/prisma.ts constructs its PrismaClient.
process.loadEnvFile(".env.test");
