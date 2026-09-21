/**
 * Type augmentation for Auth.js — adds the database user id to
 * the session object (set in the authOptions session callback).
 */
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string };
  }
}
