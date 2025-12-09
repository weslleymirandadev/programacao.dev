import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');

  if (!type || !id) {
    return NextResponse.json({ error: "Type and ID are required" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ hasAccess: false });
  }

  try {
    const userId = session.user.id;
    let hasAccess = false;

    if (type === 'course') {
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          courseId: id,
        },
      });
      hasAccess = !!enrollment;
    } else if (type === 'journey') {
      const enrollment = await prisma.enrollment.findFirst({
        where: {
          userId,
          journeyId: id,
        },
      });
      hasAccess = !!enrollment;
    }

    return NextResponse.json({ hasAccess });
  } catch (error) {
    console.error("Error checking access:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}