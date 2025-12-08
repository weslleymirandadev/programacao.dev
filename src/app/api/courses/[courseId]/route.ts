import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId: id } = await params;
    console.log('Course ID from params:', id);

    if (!id) {
      return NextResponse.json(
        { error: "Course ID is required" },
        { status: 400 }
      );
    }

    const course = await prisma.course.findUnique({
      where: { id },
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
    });

    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(course, {status: 200});
  } catch (error) {
    console.error("Error in GET /api/courses/[courseId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('Unauthorized: No session found');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { courseId: id } = await params;
    console.log('Updating course with ID:', id);

    const data = await request.json();
    console.log('Received update data:', data);

    // Validate required fields
    if (!data.title || !data.description) {
      return NextResponse.json(
        { error: "Title and description are required" },
        { status: 400 }
      );
    }

    const updatedCourse = await prisma.course.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl || null,
        price: data.price !== undefined ? Number(data.price) : null,
        discountPrice: data.discountPrice !== undefined ? Number(data.discountPrice) : 0,
        discountEnabled: data.discountEnabled !== undefined ? Boolean(data.discountEnabled) : false,
        level: data.level || 'iniciante',
        public: Boolean(data.public),
      },
    });

    console.log('Successfully updated course:', updatedCourse);
    return NextResponse.json(updatedCourse);
  } catch (error) {
    console.error("Error updating course:", error);
    return NextResponse.json(
      { 
        error: "Failed to update course",
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {courseId: id} = await params;
    
    await prisma.course.delete({
      where: { id },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting course:", error);
    return NextResponse.json(
      { error: "Failed to delete course" },
      { status: 500 }
    );
  }
}