// Shared setup for the account scripts.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
export const hash = (password: string) => bcrypt.hash(password, 10);

export { tempPassword, tempPasswordExpiry } from "../src/lib/temp-password";

export function run(main: () => Promise<void>) {
  main()
    .catch((e: Error) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
