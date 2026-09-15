// Usage: npm run create-user -- you@example.com "a strong password" "Your Name"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [, , email, password, name] = process.argv;

if (!email || !password) {
  console.error(
    'Usage: npm run create-user -- you@example.com "a strong password" "Your Name"'
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const passwordHash = await bcrypt.hash(password, 12);

const user = await prisma.user.upsert({
  where: { email: email.toLowerCase().trim() },
  update: { passwordHash, name: name ?? undefined },
  create: { email: email.toLowerCase().trim(), passwordHash, name },
});

console.log(`User ready: ${user.email} (id: ${user.id})`);
await prisma.$disconnect();
