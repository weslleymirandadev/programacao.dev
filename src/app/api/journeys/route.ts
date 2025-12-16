import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicOnly = searchParams.get("public") === "true";

    const where = publicOnly ? { public: true } : {};

    const journeys = await prisma.journey.findMany({
      where,
      include: {
        courses: {
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
        },
      },
    });

    // Transform the data to match the expected format
    const transformedJourneys = journeys.map((journey) => ({
      ...journey,
      courses: journey.courses.map((jc: { id: string; course: { id: string; title: string; description: string; imageUrl: string | null } }) => ({
        id: jc.course.id,
        course: {
          id: jc.course.id,
          title: jc.course.title,
          description: jc.course.description,
          imageUrl: jc.course.imageUrl,
        },
      })),
    }));

    return NextResponse.json(transformedJourneys);
  } catch (error) {
    console.error("Error fetching journeys:", error);
    return NextResponse.json(
      { error: "Failed to fetch journeys" },
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
    const { title, description, imageUrl, price, public: isPublic } = await request.json();

    const journey = await prisma.journey.create({
      data: {
        title,
        description,
        imageUrl: imageUrl || null,
        price: price !== undefined && price !== null ? Number(price) : null,
        public: isPublic !== undefined ? Boolean(isPublic) : false,
      },
    });

    return NextResponse.json(journey, { status: 201 });
  } catch (error) {
    console.error("Error creating journey:", error);
    return NextResponse.json(
      { error: "Failed to create journey" },
      { status: 500 }
    );
  }
}

