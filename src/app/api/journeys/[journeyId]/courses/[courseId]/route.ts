import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: { journeyId: string; courseId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Remove o curso da jornada
    await prisma.journeyCourse.deleteMany({
      where: {
        journeyId: params.journeyId,
        courseId: params.courseId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing course from journey:', error);
    return NextResponse.json(
      { error: 'Failed to remove course from journey' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { journeyId: string; courseId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { order } = await request.json();

    // Atualiza a ordem do curso na jornada
    const journeyCourse = await prisma.journeyCourse.updateMany({
      where: {
        journeyId: params.journeyId,
        courseId: params.courseId,
      },
      data: {
        order: order,
      },
    });

    if (journeyCourse.count === 0) {
      return NextResponse.json(
        { error: 'Course not found in journey' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating course order in journey:', error);
    return NextResponse.json(
      { error: 'Failed to update course order in journey' },
      { status: 500 }
    );
  }
}
