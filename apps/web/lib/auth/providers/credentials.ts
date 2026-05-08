import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { users } from "@openforge/db/schema";

export const credentialsProvider = Credentials({
  id: "credentials",
  name: "Email and password",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    const email = typeof credentials?.email === "string" ? credentials.email.trim() : "";
    const password =
      typeof credentials?.password === "string" ? credentials.password : "";

    if (!email || !password) return null;

    const db = getDb();
    const normalized = email.toLowerCase();
    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        forgejoUserId: users.forgejoUserId,
        forgejoUsername: users.forgejoUsername,
        email: users.email,
        name: users.name,
        image: users.image,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1);

    if (!user?.passwordHash) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    if (user.forgejoUserId == null || !user.forgejoUsername) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      forgejoUserId: user.forgejoUserId,
      forgejoUsername: user.forgejoUsername,
      isAdmin: user.isAdmin,
    };
  },
});
