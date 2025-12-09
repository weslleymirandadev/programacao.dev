import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PaymentItemType } from "@/generated/prisma/enums";

async function getUserId() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return (session.user as any).id as string;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cart = await prisma.cart.findUnique({
    where: { userId },
    include: {
      items: {
        include: {
          course: true,
          journey: true,
        },
      },
    },
  });

  if (!cart) {
    return NextResponse.json({ items: [] });
  }

  const items = cart.items.map((item) => ({
    id: item.courseId ?? item.journeyId ?? item.id, // Use courseId or journeyId, fallback to CartItem id
    itemType: item.itemType,
    quantity: item.quantity,
    courseId: item.courseId,
    journeyId: item.journeyId,
    title: item.course?.title ?? item.journey?.title ?? null,
    price:
      item.course?.price ??
      item.journey?.price ??
      null,
  }));

  return NextResponse.json({ items });
}

interface SaveCartItem {
  itemType: PaymentItemType;
  courseId?: string | null;
  journeyId?: string | null;
  quantity: number;
}

export async function PUT(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { items: SaveCartItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const items = body.items ?? [];

  // Filtra IDs válidos de curso e jornada para evitar violações de FK
  const courseIds = Array.from(
    new Set(
      items
        .map((item) => item.courseId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const journeyIds = Array.from(
    new Set(
      items
        .map((item) => item.journeyId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  );

  const [existingCourses, existingJourneys] = await Promise.all([
    courseIds.length
      ? prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
    journeyIds.length
      ? prisma.journey.findMany({
          where: { id: { in: journeyIds } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const validCourseIdSet = new Set(existingCourses.map((c) => c.id));
  const validJourneyIdSet = new Set(existingJourneys.map((j) => j.id));

  const sanitizedItems = items.filter((item) => {
    if (item.courseId) {
      return validCourseIdSet.has(item.courseId);
    }
    if (item.journeyId) {
      return validJourneyIdSet.has(item.journeyId);
    }
    return false;
  });

  try {
    const cart = await prisma.cart.upsert({
      where: { userId },
      create: {
        userId,
        items: {
          create: sanitizedItems.map((item) => ({
            itemType: item.itemType,
            courseId: item.courseId ?? null,
            journeyId: item.journeyId ?? null,
            quantity: item.quantity,
          })),
        },
      },
      update: {
        items: {
          deleteMany: {},
          create: sanitizedItems.map((item) => ({
            itemType: item.itemType,
            courseId: item.courseId ?? null,
            journeyId: item.journeyId ?? null,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json({
      id: cart.id,
      updatedAt: cart.updatedAt,
      items: cart.items,
    });
  } catch (error: any) {
    if (error?.code === "P2003") {
      return NextResponse.json(
        {
          error: "Invalid cart items: one or more items reference non-existing courses or journeys.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to save cart.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { itemId, itemType, clear } = body as {
      itemId?: string;
      itemType?: "COURSE" | "JOURNEY";
      clear?: boolean;
    };

    // Find the user's cart
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: { items: true },
    });

    if (!cart) {
      return NextResponse.json({ error: "Cart not found" }, { status: 404 });
    }

    if (clear) {
      // Clear the entire cart
      await prisma.cartItem.deleteMany({
        where: { cartId: cart.id },
      });
    } else if (itemId && itemType) {
      // Remove specific item from cart
      await prisma.cartItem.deleteMany({
        where: {
          cartId: cart.id,
          itemType,
          OR: [
            { courseId: itemType === "COURSE" ? itemId : null },
            { journeyId: itemType === "JOURNEY" ? itemId : null },
          ],
        },
      });
    } else {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 },
      );
    }

    // Return the updated cart
    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: {
        items: {
          include: {
            course: true,
            journey: true,
          },
        },
      },
    });

    const items = updatedCart?.items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      quantity: item.quantity,
      courseId: item.courseId,
      journeyId: item.journeyId,
      title: item.course?.title ?? item.journey?.title ?? null,
      price: item.course?.price ?? item.journey?.price ?? null,
    })) || [];

    return NextResponse.json({ items });
  } catch (error: any) {
    console.error("Error in cart DELETE:", error);
    return NextResponse.json(
      { error: "Failed to update cart" },
      { status: 500 },
    );
  }
}
