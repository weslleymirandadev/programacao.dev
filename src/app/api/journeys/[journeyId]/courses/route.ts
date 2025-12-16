import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ journeyId: string }> }
) {
  try {
    const { journeyId } = await params;

    if (!journeyId) {
      return NextResponse.json(
        { error: "Journey ID is required" },
        { status: 400 }
      );
    }

    // Check if journey exists
    const journey = await prisma.journey.findUnique({
      where: { id: journeyId },
      select: { id: true },
    });

    if (!journey) {
      return NextResponse.json(
        { error: "Journey not found" },
        { status: 404 }
      );
    }

    // Get all courses in the journey
    const journeyCourses = await prisma.journeyCourse.findMany({
      where: { journeyId },
      include: {
        course: {
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
          },
        },
      },
      orderBy: {
        order: "asc",
      },
    });

    const courses = journeyCourses.map((jc) => ({
      id: jc.course.id,
      order: jc.order,
      course: {
        id: jc.course.id,
        title: jc.course.title,
        description: jc.course.description,
        imageUrl: jc.course.imageUrl,
        price: jc.course.price,
        discountPrice: jc.course.discountPrice,
        discountEnabled: jc.course.discountEnabled,
        level: jc.course.level,
        public: jc.course.public,
      },
    }));

    return NextResponse.json(courses, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/journeys/[journeyId]/courses:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ journeyId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { journeyId } = await params;

    if (!journeyId) {
      return NextResponse.json(
        { error: "Journey ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { courseId, order } = body;

    if (!courseId) {
      return NextResponse.json(
        { error: "Course ID is required" },
        { status: 400 }
      );
    }

    // Check if journey and course exist
    const [journey, course] = await Promise.all([
      prisma.journey.findUnique({ where: { id: journeyId } }),
      prisma.course.findUnique({ where: { id: courseId } }),
    ]);

    if (!journey) {
      return NextResponse.json(
        { error: "Journey not found" },
        { status: 404 }
      );
    }

    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    // Check if the course is already in the journey
    const existing = await prisma.journeyCourse.findFirst({
      where: {
        journeyId,
        courseId,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Course already in journey" },
        { status: 409 }
      );
    }

    // Determine the order
    let finalOrder = order;
    if (finalOrder === undefined || finalOrder === null) {
      const maxOrder = await prisma.journeyCourse.findFirst({
        where: { journeyId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      finalOrder = (maxOrder?.order ?? -1) + 1;
    }

    const journeyCourse = await prisma.journeyCourse.create({
      data: {
        journeyId,
        courseId,
        order: finalOrder,
      },
      include: {
        course: {
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
          },
        },
      },
    });

    return NextResponse.json(
      {
        id: journeyCourse.course.id,
        order: journeyCourse.order,
        course: journeyCourse.course,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/journeys/[journeyId]/courses:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

