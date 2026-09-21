/**
 * Auth.js (NextAuth v4) configuration.
 *
 * Credentials provider with bcrypt password hashing. Sessions use
 * signed JWTs (stateless) — no database session lookup needed.
 */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // 30 days
    maxAge: 60 * 60 * 24 * 30,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    /** Embed the user id in the JWT on sign-in. */
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    /** Expose the id on the session object. */
    async session({ session, token }) {
      if (session.user) session.user.id = token.sub as string;
      return session;
    },
  },
};
