import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { journeyId: string } }
) {
  try {
    const journeyCourses = await prisma.journeyCourse.findMany({
      where: { journeyId: params.journeyId },
      include: {
        course: true,
      },
      orderBy: {
        order: 'asc',
      },
    });

    return NextResponse.json(journeyCourses);
  } catch (error) {
    console.error('Error fetching journey courses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journey courses' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { journeyId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { courseId, order } = await request.json();

    // Verifica se o curso existe
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return NextResponse.json(
        { error: 'Course not found' },
        { status: 404 }
      );
    }

    // Verifica se a jornada existe
    const journey = await prisma.journey.findUnique({
      where: { id: params.journeyId },
    });

    if (!journey) {
      return NextResponse.json(
        { error: 'Journey not found' },
        { status: 404 }
      );
    }

    // Verifica se o curso já está na jornada
    const existingCourse = await prisma.journeyCourse.findFirst({
      where: {
        journeyId: params.journeyId,
        courseId,
      },
    });

    if (existingCourse) {
      return NextResponse.json(
        { error: 'Course already in journey' },
        { status: 400 }
      );
    }

    // Adiciona o curso à jornada
    const journeyCourse = await prisma.journeyCourse.create({
      data: {
        journeyId: params.journeyId,
        courseId,
        order: order || 0,
      },
      include: {
        course: true,
      },
    });

    return NextResponse.json(journeyCourse);
  } catch (error) {
    console.error('Error adding course to journey:', error);
    return NextResponse.json(
      { error: 'Failed to add course to journey' },
      { status: 500 }
    );
  }
}
