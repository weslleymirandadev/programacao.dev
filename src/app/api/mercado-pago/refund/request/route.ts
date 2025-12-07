import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MercadoPagoConfig, PaymentRefund } from "mercadopago";

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

export async function POST(req: Request) {
  try {
    const { paymentId, userId } = await req.json();

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    }

    if (payment.userId !== userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    // 30 dias de limite
    const limitDate = new Date(payment.createdAt);
    limitDate.setDate(limitDate.getDate() + 30);

    if (new Date() > limitDate) {
      return NextResponse.json({ error: "Reembolso permitido somente até 30 dias" }, { status: 400 });
    }

    // Criar reembolso no Mercado Pago
    const refundClient = new PaymentRefund(client);
    const mpRefund = await refundClient.create({
      payment_id: payment.mpPaymentId,
    });

    // Registrar no banco
    const refund = await prisma.refund.create({
      data: {
        paymentId,
        mpRefundId: mpRefund.id?.toString() ?? null,
        status: mpRefund.status!,
        amount: payment.amount,
      },
    });

    // Revogar acesso imediatamente
    if (payment.itemType === "COURSE") {
      await prisma.enrollment.deleteMany({
        where: {
          userId: userId,
          courseId: payment.courseId!,
        },
      });
    }

    if (payment.itemType === "JOURNEY") {
      await prisma.enrollment.deleteMany({
        where: {
          userId: userId,
          journeyId: payment.journeyId!,
        },
      });
    }

    return NextResponse.json({ success: true, refund });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
