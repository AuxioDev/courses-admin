// Creates an admin account with a temporary password. This is the only way to make
// an admin, so a new database can get its first one without the demo seed.
// Usage: npm run admin:create -- "Aysel Aliyeva" aysel@school.az
import { db, hash, run, tempPassword, tempPasswordExpiry } from "./admin-lib";

run(async () => {
  const [name, rawEmail] = process.argv.slice(2).map((s) => s.trim());
  const email = rawEmail?.toLowerCase();
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run admin:create -- "Full Name" admin@school.az');
  }
  if (await db.user.findUnique({ where: { email } })) throw new Error(`${email} already has an account`);

  const password = tempPassword();
  await db.user.create({
    data: { name, email, role: "admin", passwordHash: await hash(password), mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry() },
  });
  console.log(`Created ${name} <${email}>. Temporary password: ${password}`);
  console.log("They will be asked to choose their own password when they log in.");
});
