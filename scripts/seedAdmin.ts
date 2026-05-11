import { db } from "../db";
import { users } from "../shared/schema";
import { scrypt, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import "dotenv/config";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function seedAdmin() {
  try {
    const adminName = process.env.ADMIN_NAME;
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    // ✅ Make sure all env variables are set
    if (!adminName || !adminEmail || !adminPassword) {
      console.error("❌ Missing ADMIN_NAME, ADMIN_EMAIL or ADMIN_PASSWORD in environment variables.");
      process.exit(1);
    }

    // ✅ Check if admin already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, adminEmail));

    if (existing[0]) {
      console.log("✅ Admin account already exists — skipping creation.");
      process.exit(0);
    }

    // ✅ Create admin from env only
    const hashedPassword = await hashPassword(adminPassword);
    await db.insert(users).values({
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
    });

    console.log("✅ Admin created successfully.");
    process.exit(0);

  } catch (error) {
    console.error("❌ Failed to seed admin:", error);
    process.exit(1);
  }
}

seedAdmin();
