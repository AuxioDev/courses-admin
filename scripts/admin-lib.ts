// Shared setup for the account scripts.
import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
export const hash = (password: string) => bcrypt.hash(password, 10);

const WORDS = ["kite", "moss", "lamp", "reef", "fern", "dune", "mint", "opal", "pine", "wave", "jade", "bolt"];

export function tempPassword() {
  const pick = () => WORDS[randomBytes(1)[0] % WORDS.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${digits}-${pick()}`;
}

export function run(main: () => Promise<void>) {
  main()
    .catch((e: Error) => {
      console.error(e.message);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
