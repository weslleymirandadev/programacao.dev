import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";


// ----------------------------------
// Middleware: permitir apenas ADMIN
// ----------------------------------
async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "ADMIN") {
    return null;
  }

  return session;
}


// ----------------------------------
// GET: Lista todos os RoleEmails
// ----------------------------------
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const emails = await prisma.roleEmail.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(emails);
}


// ----------------------------------
// POST: Cadastrar novo email + role
// ----------------------------------
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email, role } = await req.json() as {
    email?: string;
    role?: "ADMIN" | "MODERATOR";
  };

  if (!email || !role) {
    return NextResponse.json({ error: "Email e role são obrigatórios" }, { status: 400 });
  }

  try {
    const created = await prisma.roleEmail.create({
      data: { email, role },
    });

    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json({ error: "Email já registrado" }, { status: 409 });
  }
}


// ----------------------------------
// DELETE: Remover email autorizado
// ----------------------------------
export async function DELETE(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email } = await req.json() as { email?: string };

  if (!email) {
    return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
  }

  await prisma.roleEmail.delete({
    where: { email },
  });

  return NextResponse.json({ success: true });
}
