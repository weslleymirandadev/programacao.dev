import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const isPublic = searchParams.get("public") === "true";

    const courses = await prisma.course.findMany({
      where: isPublic ? { public: true } : undefined,
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        price: true,
        discountPrice: true,
        discountEnabled: true,
        level: true,
        public: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(courses);
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { title, description, imageUrl, price, discountPrice, discountEnabled, level, public: isPublic } = await request.json();

    const course = await prisma.course.create({
      data: {
        title,
        description,
        imageUrl,
        price,
        discountPrice: discountPrice !== undefined ? Number(discountPrice) : 0,
        discountEnabled: discountEnabled !== undefined ? Boolean(discountEnabled) : false,
        level,
        public: isPublic,
      },
    });

    return NextResponse.json(course, { status: 201 });
  } catch (error) {
    console.error("Error creating course:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 }
    );
  }
}
