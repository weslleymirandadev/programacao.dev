import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MercadoPagoConfig, Payment as MPPayment } from "mercadopago";

type PaymentStatus = 'PENDING' | 'APPROVED' | 'REFUNDED' | 'CANCELLED' | 'FAILED';
type PaymentItemType = 'COURSE' | 'JOURNEY';
type ItemType = 'course' | 'journey';

interface PaymentMetadata {
  userId?: string;
  items?: Array<{
    id: string;
    type: ItemType;
    quantity?: number;
    title?: string;
    price?: number;
  }>;
  durationMonths?: number;
  [key: string]: any;
}

interface PaymentItem {
  id: string;
  type: ItemType;
  quantity?: number;
  price?: number;
  title?: string;
  description?: string;
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

async function revokeUserAccess(userId: string, items: PaymentItem[]) {
  for (const item of items) {
    try {
      if (item.type === 'course') {
        await prisma.enrollment.deleteMany({
          where: { userId, courseId: item.id }
        });
        console.log(`Acesso removido do curso ${item.id} para o usuário ${userId}`);
      } else if (item.type === 'journey') {
        await prisma.enrollment.deleteMany({
          where: { userId, journeyId: item.id }
        });
        console.log(`Acesso removido da jornada ${item.id} para o usuário ${userId}`);
      }
    } catch (error) {
      console.error(`Erro ao remover acesso para ${item.type} ${item.id}:`, error);
    }
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
    await prisma.payment.update({
      where: { mpPaymentId: paymentId },
      data: { status },
      include: { refunds: true }
    });

    // Se for um reembolso ou cancelamento, remover acesso aos itens
    if (status === 'REFUNDED' || status === 'CANCELLED') {
      await revokeUserAccess(userId, items);
      
      // Atualizar status dos reembolsos pendentes
      await prisma.refund.updateMany({
        where: { 
          payment: { mpPaymentId: paymentId },
          status: 'PENDING'
        },
        data: { 
          status: 'COMPLETED',
        }
      });
      console.log(`Status do reembolso atualizado para COMPLETED para o pagamento ${paymentId}`);
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
  try {
    await ensureUserExists(userId);

    // Ensure items have required fields
    const validatedItems = items.map(item => ({
      ...item,
      quantity: item.quantity || 1,
      price: item.price || Math.round((amount * 100) / items.length),
      title: item.title || (item.type === 'course' ? 'Curso' : 'Jornada')
    }));

    const totalAmount = validatedItems.reduce((sum, item) => sum + (item.price || 0), 0);

    // Create or update payment
    const payment = await prisma.payment.upsert({
      where: { mpPaymentId: paymentId },
      create: {
        mpPaymentId: paymentId,
        userId,
        status: 'APPROVED',
        amount: totalAmount,
        metadata: { 
          items: validatedItems,
          durationMonths 
        },
        items: {
          create: validatedItems.map(item => {
            const isCourse = item.type === 'course';
            return {
              itemType: isCourse ? 'COURSE' : 'JOURNEY',
              [isCourse ? 'courseId' : 'journeyId']: item.id,
              quantity: item.quantity,
              price: item.price || 0,
              title: item.title,
              description: isCourse ? 'Curso' : 'Jornada',
            };
          })
        }
      },
      update: {
        status: 'APPROVED',
        amount: totalAmount,
        metadata: { 
          items: validatedItems,
          durationMonths 
        }
      },
      include: { 
        items: true 
      }
    });

    // Create enrollments
    await Promise.all(
      validatedItems.map(async (item) => {
        if (item.type === 'course') {
          await prisma.enrollment.upsert({
            where: { 
              userId_courseId: { 
                userId, 
                courseId: item.id 
              } 
            },
            create: { 
              userId, 
              courseId: item.id, 
              endDate: null 
            },
            update: {}
          });
        } else if (item.type === 'journey') {
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + durationMonths);

          await prisma.enrollment.upsert({
            where: { 
              userId_journeyId: { 
                userId, 
                journeyId: item.id 
              } 
            },
            create: { 
              userId, 
              journeyId: item.id, 
              endDate 
            },
            update: { endDate }
          });
        }
      })
    );

    return payment;
  } catch (error) {
    console.error('Error in processApprovedPayment:', error);
    throw error;
  }

  // Criar matrículas
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
      
      // Update payment status
      await prisma.payment.update({
        where: { mpPaymentId: mpPaymentId.toString() },
        data: { status: mappedStatus }
      });
      
      // Revoke user access for refunded items
      if (status === 'refunded') {
        await revokeUserAccess(userId, items);
      }
      
      return sendOK();
    }

    // APPROVED
    if (status === "approved") {
      await processApprovedPayment(
        mpPaymentId.toString(),
        userId,
        payment.transaction_amount!,
        items,
        metadata.durationMonths ? metadata.durationMonths : 12
      );
      return sendOK();
    }

    // PENDING / IN_PROCESS / MEDIATION
    try {
      await ensureUserExists(userId);

      // Calculate amount in cents
      const amount = payment.transaction_amount
        ? Math.round(payment.transaction_amount * 100)
        : 0;

      // Prepare items data
      const itemsData = items.map(item => ({
        ...item,
        quantity: item.quantity || 1,
        price: item.price || Math.round(amount / Math.max(1, items.length)),
        title: item.title || (item.type === 'course' ? 'Curso' : 'Jornada')
      }));

      // Create or update payment with items
      await prisma.payment.upsert({
        where: { mpPaymentId: mpPaymentId.toString() },
        create: {
          mpPaymentId: mpPaymentId.toString(),
          userId,
          status: mappedStatus,
          amount,
          metadata: { items: itemsData },
          items: {
            create: itemsData.map(item => {
              const isCourse = item.type === 'course';
              return {
                itemType: isCourse ? 'COURSE' : 'JOURNEY',
                [isCourse ? 'courseId' : 'journeyId']: item.id,
                quantity: item.quantity,
                price: item.price || 0,
                title: item.title,
                description: isCourse ? 'Curso' : 'Jornada',
              };
            })
          }
        },
        update: {
          status: mappedStatus,
          amount,
          metadata: { items: itemsData }
        },
        include: { items: true }
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
