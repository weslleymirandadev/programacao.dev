import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare, hash } from "bcryptjs";
import prisma from "./prisma";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { UserRole } from "@/generated/prisma/enums";

async function resolveUserRole(email: string): Promise<"USER" | "ADMIN" | "MODERATOR"> {
  const roleEntry = await prisma.roleEmail.findUnique({
    where: { email },
  });

  return roleEntry?.role ?? "USER";
}

// Cria usuário social (Google) sem senha
async function findOrCreateSocialUser(email: string, name: string, image?: string) {
  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name,
        image,
        role: await resolveUserRole(email) as UserRole,
      },
    });
  }

  return user;
}

// ---------------------------
// AUTH OPTIONS
// ---------------------------

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 dias
  },

  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/auth/signin",
  },

  providers: [
    // --- Google OAuth ---
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),

    // --- GitHub OAuth ---
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),

    // --- Credentials login (email/senha) ---
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const { email, password } = credentials as {
          email: string;
          password: string;
        };

        if (!email || !password) {
          throw new Error("Preencha e-mail e senha.");
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: { passwords: true },
        });

        // -------------------------------------
        // 1) Usuário existe → validar senha
        // -------------------------------------
        if (user) {
          if (!user.passwords) {
            throw new Error("Conta registrada via login social. Use Google.");
          }

          const ok = await compare(password, user.passwords.hash);
          if (!ok) {
            throw new Error("Senha incorreta.");
          }

          return user;
        }

        // -------------------------------------
        // 2) Usuário não existe → criar conta
        // -------------------------------------
        const hashed = await hash(password, 10);

        const created = await prisma.user.create({
          data: {
            email,
            name: email.split("@")[0],
            role: await resolveUserRole(email) as UserRole,
            passwords: {
              create: {
                hash: hashed,
              },
            },
          },
          include: { passwords: true },
        });

        return created;
      },
    }),
  ],

  callbacks: {
    // Antes de criar sessão, trata login social (Google / GitHub)
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" || account?.provider === "github") {
        const email = user.email ?? profile?.email;
        const name = user.name ?? profile?.name;
        const image =
          (profile as any)?.picture ??
          (profile as any)?.image ??
          user.image ??
          undefined;

        if (!email) throw new Error("Login social não retornou e-mail.");

        // Se login via GitHub e for o ADMIN_EMAIL, registra/atualiza role ADMIN
        if (email === process.env.ADMIN_EMAIL) {
          await prisma.roleEmail.upsert({
            where: { email },
            update: { role: "ADMIN" },
            create: { email, role: "ADMIN" },
          });
        }

        const dbUser = await findOrCreateSocialUser(
          email,
          name ?? "Usuário",
          image
        );

        // Sincroniza ID/role com NextAuth
        user.id = dbUser.id;
        (user as any).role = dbUser.role;
      }

      return true;
    },

    // JWT → carrega ID e role do usuário para o token
    async jwt({ token, user }) {
      if (user) {
        (token as any).id = (user as any).id;
        (token as any).role = (user as any).role;
      }
      return token;
    },

    // Sessão → devolve ID e role pra UI a partir do token
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).id;
        (session.user as any).role = (token as any).role;
      }
      return session;
    },
  },

  debug: process.env.NODE_ENV === "development",
};
