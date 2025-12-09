import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get('type');
  const id = searchParams.get('id');

  if (!typeParam || !id) {
    return NextResponse.json({ error: "Type and ID are required" }, { status: 400 });
  }

  // Normalize type (accept both 'course'/'journey' and 'curso'/'jornada')
  const type = typeParam === 'curso' ? 'course' : typeParam === 'jornada' ? 'journey' : typeParam;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ hasAccess: false });
  }

  try {
    const userId = session.user.id;
    let hasAccess = false;
    const now = new Date();

    if (type === 'course') {
      // Para cursos: endDate pode ser null (acesso vitalício) ou maior que hoje (acesso ativo)
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          courseId: id,
          OR: [
            { endDate: null }, // Acesso vitalício
            { endDate: { gte: now } } // Acesso ativo (não expirado)
          ]
        },
      });
      hasAccess = !!enrollment;
      
      console.log('Verificação de acesso ao curso:', {
        userId,
        courseId: id,
        hasAccess,
        enrollment: enrollment ? { id: enrollment.id, endDate: enrollment.endDate } : null
      });
    } else if (type === 'journey') {
      // Para jornadas: endDate pode ser null (acesso vitalício) ou maior que hoje (acesso ativo)
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          journeyId: id,
          OR: [
            { endDate: null }, // Acesso vitalício
            { endDate: { gte: now } } // Acesso ativo (não expirado)
          ]
        },
      });
      hasAccess = !!enrollment;
      
      console.log('Verificação de acesso à jornada:', {
        userId,
        journeyId: id,
        hasAccess,
        enrollment: enrollment ? { id: enrollment.id, endDate: enrollment.endDate } : null
      });
    }

    return NextResponse.json({ hasAccess });
  } catch (error) {
    console.error("Error checking access:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}