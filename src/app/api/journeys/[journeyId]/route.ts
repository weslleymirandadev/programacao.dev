import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ journeyId: string }> }
) {
  try {
    const { journeyId: id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Journey ID is required" },
        { status: 400 }
      );
    }

    const journey = await prisma.journey.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        imageUrl: true,
        price: true,
        public: true,
        courses: {
          select: {
            id: true,
            course: {
              select: {
                id: true,
                title: true,
                description: true,
                imageUrl: true,
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!journey) {
      return NextResponse.json(
        { error: "Journey not found" },
        { status: 404 }
      );
    }

    // Transform the data to match the expected format
    const transformedJourney = {
      ...journey,
      courses: journey.courses.map((jc) => ({
        id: jc.course.id,
        course: {
          id: jc.course.id,
          title: jc.course.title,
          description: jc.course.description,
          imageUrl: jc.course.imageUrl,
        },
      })),
    };

    return NextResponse.json(transformedJourney, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/journeys/[journeyId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ journeyId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { journeyId: id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Journey ID is required" },
        { status: 400 }
      );
    }

    const data = await request.json();

    const updatedJourney = await prisma.journey.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl || null,
        price: data.price !== undefined && data.price !== null ? Number(data.price) : null,
        public: Boolean(data.public),
      },
    });

    return NextResponse.json(updatedJourney);
  } catch (error) {
    console.error("Error updating journey:", error);
    return NextResponse.json(
      {
        error: "Failed to update journey",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ journeyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { journeyId: id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Journey ID is required" },
        { status: 400 }
      );
    }

    await prisma.journey.delete({
      where: { id },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting journey:", error);
    return NextResponse.json(
      { error: "Failed to delete journey" },
      { status: 500 }
    );
  }
}

