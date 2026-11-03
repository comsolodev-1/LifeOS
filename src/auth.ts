import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { isOwnerEmail } from "@/lib/owner";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, GitHub],
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ user, profile }) {
      const verified = profile && "email_verified" in profile ? profile.email_verified !== false : true;
      return verified && isOwnerEmail(user.email, process.env.OWNER_EMAIL);
    },
  },
});
