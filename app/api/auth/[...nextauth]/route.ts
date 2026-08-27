import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import pool from '../../../../lib/db';

export const authOptions: any = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: any) {
        if (!credentials?.email || !credentials?.password) return null;
        const res = await pool.query(
          'SELECT id, email, name, password_hash, role, permissions FROM users WHERE email = $1',
          [credentials.email]
        );
        if (!res.rows.length) return null;
        const user = res.rows[0];
        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;
        return { id: String(user.id), email: user.email, name: user.name, role: user.role, permissions: user.permissions || ['전체'] };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.role = user.role;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }: any) {
      (session.user as any).role = token.role;
      (session.user as any).permissions = token.permissions;
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions as any);

export { handler as GET, handler as POST };
