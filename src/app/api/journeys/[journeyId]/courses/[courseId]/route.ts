import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ journeyId: string; courseId: string }> }
) {
  try {
    const { journeyId, courseId } = await params;

    if (!journeyId || !courseId) {
      return NextResponse.json(
        { error: "Journey ID and Course ID are required" },
        { status: 400 }
      );
    }

    const journeyCourse = await prisma.journeyCourse.findFirst({
      where: {
        journeyId,
        courseId,
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
          },
        },
      },
    });

    if (!journeyCourse) {
      return NextResponse.json(
        { error: "Course not found in journey" },
        { status: 404 }
      );
    }

    return NextResponse.json(journeyCourse, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/journeys/[journeyId]/courses/[courseId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ journeyId: string; courseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { journeyId, courseId } = await params;

    if (!journeyId || !courseId) {
      return NextResponse.json(
        { error: "Journey ID and Course ID are required" },
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

    // Get the current max order for this journey
    const maxOrder = await prisma.journeyCourse.findFirst({
      where: { journeyId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const newOrder = (maxOrder?.order ?? -1) + 1;

    const journeyCourse = await prisma.journeyCourse.create({
      data: {
        journeyId,
        courseId,
        order: newOrder,
      },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
          },
        },
      },
    });

    return NextResponse.json(journeyCourse, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/journeys/[journeyId]/courses/[courseId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ journeyId: string; courseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { journeyId, courseId } = await params;

    if (!journeyId || !courseId) {
      return NextResponse.json(
        { error: "Journey ID and Course ID are required" },
        { status: 400 }
      );
    }

    await prisma.journeyCourse.deleteMany({
      where: {
        journeyId,
        courseId,
      },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error in DELETE /api/journeys/[journeyId]/courses/[courseId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

