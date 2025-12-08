import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { journeyId: string } }
) {
  try {
    const journey = await prisma.journey.findUnique({
      where: { id: params.journeyId },
      include: {
        courses: {
          include: {
            course: true,
          },
          orderBy: {
            order: 'asc',
          },
        },
      },
    });

    if (!journey) {
      return NextResponse.json(
        { error: 'Journey not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(journey);
  } catch (error) {
    console.error('Error fetching journey:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journey' },
      { status: 500 }
    );
  }
}

export async function PUT(
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

    const data = await request.json();
    
    const journey = await prisma.journey.update({
      where: { id: params.journeyId },
      data: {
        title: data.title,
        description: data.description,
        imageUrl: data.imageUrl,
        price: data.price,
        public: data.public,
      },
    });

    return NextResponse.json(journey);
  } catch (error) {
    console.error('Error updating journey:', error);
    return NextResponse.json(
      { error: 'Failed to update journey' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await prisma.journey.delete({
      where: { id: params.journeyId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting journey:', error);
    return NextResponse.json(
      { error: 'Failed to delete journey' },
      { status: 500 }
    );
  }
}
