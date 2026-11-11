// Only used to generate the Prisma client. The Student Diary owns the migrations,
// so this repo has no migrations folder and must never run `prisma migrate deploy` or `dev`
// (`prisma migrate diff`, which only compares and changes nothing, is what CI uses).
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
