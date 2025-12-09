import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MercadoPagoConfig, Payment as MPPayment } from "mercadopago";

type PaymentStatus = 'PENDING' | 'APPROVED' | 'REFUNDED' | 'CANCELLED' | 'FAILED';
type PaymentItemType = 'COURSE' | 'JOURNEY' | 'MULTIPLE';

interface PaymentMetadata {
  userId?: string;
  items?: Array<{id: string; type: string; quantity?: number}>;
  [key: string]: any;
}

interface PaymentItem {
  id: string;
  type: string;
  quantity?: number;
}

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

const paymentStatusMap: Record<string, PaymentStatus> = {
  'pending': 'PENDING',
  'approved': 'APPROVED',
  'refunded': 'REFUNDED',
  'cancelled': 'CANCELLED',
  'rejected': 'FAILED',
  'in_process': 'PENDING',
  'in_mediation': 'PENDING',
  'charged_back': 'FAILED'
};


async function ensureUserExists(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!user) {
      const error = new Error(`Usuário com ID ${userId} não encontrado`);
      console.error(error.message);
      throw error;
    }
    return user;
  } catch (error) {
    console.error('Erro ao verificar usuário:', error);
    throw error;
  }
}

async function sendOK(obj: any = { ok: true }) {
  return new NextResponse(JSON.stringify(obj), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function getPaymentWithFallback(mpPaymentId: string) {
  try {
    const payment = await new MPPayment(client).get({ id: mpPaymentId });
    
    // Se não tiver userId no metadata, tenta buscar do banco de dados
    if (!payment.metadata?.userId) {
      console.log('Buscando userId do banco de dados para o pagamento:', mpPaymentId);
      const dbPayment = await prisma.payment.findUnique({
        where: { mpPaymentId: mpPaymentId.toString() },
        select: { userId: true, metadata: true }
      });
      
      if (dbPayment?.userId) {
        console.log('UserId encontrado no banco de dados:', dbPayment.userId);
        payment.metadata = {
          ...(payment.metadata || {}),
          ...(dbPayment.metadata as any || {}),
          userId: dbPayment.userId
        };
      }
    }
    
    return payment;
  } catch (err) {
    console.error("Erro ao buscar pagamento:", err);
    throw err;
  }
}

async function handlePaymentStatusUpdate(
  paymentId: string,
  status: PaymentStatus,
  userId: string,
  items: PaymentItem[]
) {
  try {
    await ensureUserExists(userId);
    
    // Atualizar status do pagamento
    const payment = await prisma.payment.upsert({
      where: { mpPaymentId: paymentId },
      create: {
        mpPaymentId: paymentId,
        status,
        amount: 0, // Será atualizado abaixo se necessário
        user: { connect: { id: userId } },
        itemType: items.length === 1 
          ? items[0].type === 'journey' ? 'JOURNEY' : 'COURSE'
          : 'MULTIPLE',
        metadata: { items } as any, // Garantir que os itens sejam salvos no metadata
      },
      update: { 
        status,
        metadata: { items } as any, // Atualizar os itens no metadata também
      },
      include: { 
        refunds: true,
        course: items.some(i => i.type === 'course') ? true : undefined,
        journey: items.some(i => i.type === 'journey') ? true : undefined,
      }
    });

    // Se for um reembolso, remover acesso aos itens
    if (status === 'REFUNDED' || status === 'CANCELLED') {
      const itemsToProcess = items.length > 0 
        ? items 
        : (payment as any).metadata?.items || [];

      for (const item of itemsToProcess) {
        try {
          if (item.type === 'course') {
            const courseId = item.id || (payment as any).courseId;
            if (courseId) {
              await prisma.enrollment.deleteMany({
                where: { 
                  userId,
                  courseId: courseId
                }
              });
              console.log(`Acesso removido do curso ${courseId} para o usuário ${userId}`);
            }
          } else if (item.type === 'journey') {
            const journeyId = item.id || (payment as any).journeyId;
            if (journeyId) {
              await prisma.enrollment.deleteMany({
                where: { 
                  userId,
                  journeyId: journeyId
                }
              });
              console.log(`Acesso removido da jornada ${journeyId} para o usuário ${userId}`);
            }
          }
        } catch (error) {
          console.error(`Erro ao remover acesso para item ${item.id} (${item.type}):`, error);
        }
      }

      // Atualizar status do reembolso se existir
      if (payment.refunds && payment.refunds.length > 0) {
        await prisma.refund.updateMany({
          where: { 
            paymentId: payment.id,
            status: 'PENDING'
          },
          data: { 
            status: 'COMPLETED',
          }
        });
        console.log(`Status do reembolso atualizado para COMPLETED para o pagamento ${paymentId}`);
      }
    }
  } catch (error) {
    console.error('Erro ao processar atualização de status de pagamento:', error);
    throw error;
  }
}

async function processApprovedPayment(
  paymentId: string,
  userId: string,
  amount: number,
  items: PaymentItem[],
  durationMonths: number = 12
) {
  // Ensure user exists before proceeding
  await ensureUserExists(userId);

  const paymentData = {
    user: { connect: { id: userId } },
    mpPaymentId: paymentId,
    status: 'APPROVED' as const,
    amount: Math.round(amount * 100),
    itemType: (items.length === 1
      ? items[0].type === 'journey' ? 'JOURNEY' : 'COURSE'
      : 'MULTIPLE') as PaymentItemType,
    ...(items.length === 1 && items[0].type === 'course'
      ? { course: { connect: { id: items[0].id } } }
      : {}),
    ...(items.length === 1 && items[0].type === 'journey'
      ? { journey: { connect: { id: items[0].id } } }
      : {}),
  };

  await prisma.payment.upsert({
    where: { mpPaymentId: paymentId },
    create: paymentData,
    update: {
      status: 'APPROVED',
      amount: paymentData.amount,
    },
  });

  for (const item of items) {
    if (item.type === 'course') {
      await prisma.enrollment.upsert({
        where: { userId_courseId: { userId, courseId: item.id } },
        create: { userId, courseId: item.id, endDate: null },
        update: {},
      });
    } else if (item.type === 'journey') {
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + durationMonths);

      await prisma.enrollment.upsert({
        where: { userId_journeyId: { userId, journeyId: item.id } },
        create: { userId, journeyId: item.id, endDate },
        update: { endDate },
      });
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    if (!body) {
      console.error("Webhook sem body");
      return sendOK({ error: "invalid_body" });
    }

    console.log("Webhook recebido:", JSON.stringify(body, null, 2));

    const validTypes = ["payment", "refund", "chargeback", "merchant_order"];
    if (!validTypes.includes(body.type)) {
      console.log("Ignorando evento:", body.type);
      return sendOK({ ignored: true });
    }

    const mpPaymentId = body?.data?.id;
    if (!mpPaymentId) {
      console.error("Webhook sem paymentId");
      return sendOK({ error: "missing_payment_id" });
    }

    console.log('Processando webhook para pagamento ID:', mpPaymentId);
    
    let payment;
    try {
      payment = await getPaymentWithFallback(mpPaymentId);
    } catch (err) {
      console.error("Erro ao buscar pagamento:", err);
      return sendOK({ error: "payment_fetch_failed" });
    }

    console.log("Detalhes do pagamento:", {
      paymentId: payment.id,
      status: payment.status,
      hasMetadata: !!payment.metadata,
      metadataKeys: payment.metadata ? Object.keys(payment.metadata) : []
    });

    const status = String(payment.status || "").toLowerCase();
    const metadata: PaymentMetadata = payment.metadata || {};
    
    // Tenta obter o userId de várias fontes
    const userId = metadata.userId || 
                  (payment as any)?.external_reference || 
                  (payment as any)?.metadata?.user_id;

    console.log('Dados do usuário encontrados:', {
      fromMetadata: metadata.userId ? 'metadata' : 'not_found',
      fromExternalRef: (payment as any)?.external_reference ? 'external_reference' : 'not_found',
      fromNestedMetadata: (payment as any)?.metadata?.user_id ? 'nested_metadata' : 'not_found',
      userId
    });

    if (!userId) {
      console.error('Pagamento sem userId:', {
        mpPaymentId,
        metadata: payment.metadata,
        external_reference: (payment as any)?.external_reference,
        rawPayment: JSON.stringify(payment, null, 2)
      });
      return sendOK({ error: "missing_user_id", details: "Nenhum userId encontrado no pagamento" });
    }


    const items: PaymentItem[] =
      Array.isArray(metadata.items) && metadata.items.length > 0
        ? metadata.items
        : metadata.type && metadata.id
        ? [{ id: metadata.id, type: metadata.type, quantity: 1 }]
        : [];

    if (items.length === 0) {
      console.error("Pagamento sem items");
      return sendOK({ error: "missing_items" });
    }

    const mappedStatus = paymentStatusMap[status] || "PENDING";

    // REFUNDED / CANCELLED / FAILED
    if (["refunded", "cancelled", "rejected", "charged_back"].includes(status)) {
      console.log(`Processando status negativo: ${status}`);
      await handlePaymentStatusUpdate(
        mpPaymentId.toString(),
        mappedStatus,
        userId,
        items
      );
      return sendOK();
    }

    // APPROVED
    if (status === "approved") {
      await processApprovedPayment(
        mpPaymentId.toString(),
        userId,
        payment.transaction_amount!,
        items,
        metadata.durationMonths ? parseInt(metadata.durationMonths) : 12
      );
      return sendOK();
    }

    // PENDING / IN_PROCESS / MEDIATION
    try {
      await ensureUserExists(userId);

      await prisma.payment.upsert({
        where: { mpPaymentId: mpPaymentId.toString() },
        create: {
          user: { connect: { id: userId } },
          mpPaymentId: mpPaymentId.toString(),
          status: mappedStatus,
          amount: payment.transaction_amount
            ? Math.round(payment.transaction_amount * 100)
            : 0,
          itemType:
            items.length === 1
              ? items[0].type === "journey"
                ? "JOURNEY"
                : "COURSE"
              : "MULTIPLE",
        },
        update: {
          status: mappedStatus,
        },
      });
    } catch (error) {
      console.error('Erro ao processar pagamento:', error);
      return sendOK({
        error: 'user_not_found',
        message: 'Falha ao processar pagamento: Usuário não encontrado',
        details: error instanceof Error ? error.message : String(error)
      });
    }

    return sendOK();
  } catch (err) {
    console.error("Erro geral webhook:", err);
    return sendOK({ error: "internal" });
  }
}
