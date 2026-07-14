import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import clientPromise from "@/lib/mongo"

const ALLOWED_DOMAIN = "menatransport.co.th"

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const email  = user?.email ?? (profile as { email?: string })?.email ?? ""
      const domain = email.split("@")[1]?.toLowerCase()
      if (domain !== ALLOWED_DOMAIN) return false

      try {
        const client = await clientPromise
        const db = client.db("atms")
        await db.collection("bi_app_users").updateOne(
          { email },
          {
            $set: {
              name:      user.name  ?? "",
              image:     user.image ?? "",
              last_seen: new Date(),
            },
            $setOnInsert: {
              group_id:   null,
              group_name: null,
              created_at: new Date(),
            },
          },
          { upsert: true }
        )
      } catch {
        // don't block sign-in if DB write fails
      }

      return true
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as { id?: string }).id = token.sub
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
    error:  "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
}
