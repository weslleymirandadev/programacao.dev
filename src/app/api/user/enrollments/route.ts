import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    // Get user with their enrollments, courses, and journeys
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        enrollments: {
          where: {
            OR: [
              { endDate: null },
              { endDate: { gte: new Date() } }
            ]
          },
          include: {
            course: {
              include: {
                modules: {
                  include: {
                    lessons: {
                      select: {
                        id: true,
                        title: true,
                        order: true
                      },
                      orderBy: { order: 'asc' }
                    }
                  },
                  orderBy: { order: 'asc' }
                }
              }
            },
            journey: {
              include: {
                courses: {
                  include: {
                    course: {
                      include: {
                        modules: {
                          include: {
                            lessons: {
                              select: {
                                id: true,
                                title: true,
                                order: true
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  orderBy: { order: 'asc' }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      return new NextResponse('User not found', { status: 404 });
    }

    // Separate courses and journeys
    const courses = user.enrollments
      .filter(e => e.course && !e.journey)
      .map(e => e.course!);

    const journeys = user.enrollments
      .filter(e => e.journey)
      .map(e => e.journey!);

    return NextResponse.json({ courses, journeys });

  } catch (error) {
    console.error('Error fetching enrollments:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}