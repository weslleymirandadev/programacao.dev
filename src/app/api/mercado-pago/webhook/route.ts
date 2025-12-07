import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MercadoPagoConfig, Payment as MPPayment } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

/**
 * WEBHOOK – Mercado Pago
 * Recebe notificações de pagamento, atualização de status e reembolso.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const validTypes = ["payment", "refund", "chargeback", "merchant_order"];

    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ ok: true });
    }

    const mpPaymentId = body?.data?.id;
    if (!mpPaymentId) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Busca status completo SEMPRE
    const payment = await new MPPayment(client).get({ id: mpPaymentId });
    const status = payment.status;                // approved, refunded, cancelled...
    const metadata = payment.metadata || {};
    const userId = metadata.userId;
    const itemType = metadata.type;               // "course" | "journey"
    const itemId = metadata.id;                   // ID do curso ou jornada
    const durationMonths = metadata.durationMonths ?? 12;

    if (!userId || !itemType || !itemId) {
      return NextResponse.json({ ok: true });
    }

    // =====================================================================
    // 1. SE STATUS = REFUNDED — CRIAR UMA LÓGICA DE REVERSÃO DE ACESSO
    // =====================================================================
    if (status === "refunded" || status === "cancelled") {
      await prisma.payment.updateMany({
        where: { mpPaymentId: mpPaymentId.toString() },
        data: { status: status.toUpperCase() },
      });

      // Remove acesso do usuário
      if (itemType === "course") {
        await prisma.enrollment.deleteMany({
          where: { userId, courseId: itemId },
        });
      }

      if (itemType === "journey") {
        await prisma.enrollment.deleteMany({
          where: { userId, journeyId: itemId },
        });
      }

      return NextResponse.json({ ok: true });
    }

    // =====================================================================
    // 2. PROCESSA SOMENTE PAGAMENTOS APROVADOS
    // =====================================================================
    if (status !== "approved") {
      return NextResponse.json({ ok: true });
    }

    // =====================================================================
    // 3. Idempotência — evitar processar duas vezes
    // =====================================================================
    const exists = await prisma.payment.findUnique({
      where: { mpPaymentId: mpPaymentId.toString() },
    });

    if (exists) {
      return NextResponse.json({ ok: true });
    }

    // =====================================================================
    // 4. Registrar pagamento
    // =====================================================================
    const newPayment = await prisma.payment.create({
      data: {
        userId,
        mpPaymentId: mpPaymentId.toString(),
        status: "APPROVED",
        amount: payment.transaction_amount!,
        itemType: itemType === "journey" ? "JOURNEY" : "COURSE",
        courseId: itemType === "course" ? itemId : null,
        journeyId: itemType === "journey" ? itemId : null,
      },
    });

    if (itemType === "course") {
      await prisma.enrollment.upsert({
        where: {
          userId_courseId: { userId, courseId: itemId },
        },
        create: {
          userId,
          courseId: itemId,
          endDate: null,  // Vitalício
        },
        update: {},
      });
    }

    //
    // JORNADA: prazo definido
    //
    if (itemType === "journey") {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + durationMonths);

      await prisma.enrollment.upsert({
        where: {
          userId_journeyId: { userId, journeyId: itemId },
        },
        create: {
          userId,
          journeyId: itemId,
          endDate,
        },
        update: {},
      });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
