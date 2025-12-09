import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MercadoPagoConfig, PaymentRefund } from "mercadopago";

type PaymentItem = {
  id: string;
  type: 'curso' | 'jornada';
  quantity?: number;
  price?: number;
  title?: string;
};

type PaymentMetadata = {
  items?: PaymentItem[];
  durationMonths?: number;
  [key: string]: any;
};

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

export async function POST(req: Request) {
  try {
    const { paymentId, userId } = await req.json();
    console.log(`Iniciando processo de reembolso para pagamento ${paymentId}, usuário ${userId}`);

    // Buscar pagamento com itens e reembolsos
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        items: true,
        refunds: true,
        user: {
          select: {
            id: true,
            email: true
          }
        }
      }
    });

    if (!payment) {
      console.error(`Pagamento não encontrado: ${paymentId}`);
      return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });
    }

    if (payment.userId !== userId) {
      console.error(`Acesso não autorizado: usuário ${userId} tentou reembolsar pagamento de outro usuário`);
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }

    // Verificar se já existe um reembolso aprovado
    const hasApprovedRefund = payment.refunds.some(r => r.status === 'COMPLETED' || r.status === 'APPROVED');
    if (hasApprovedRefund) {
      console.error(`Já existe um reembolso aprovado para o pagamento ${paymentId}`);
      return NextResponse.json({ 
        error: "Este pagamento já foi reembolsado" 
      }, { status: 400 });
    }

    // 7 dias de limite para reembolso
    const limitDate = new Date(payment.createdAt);
    limitDate.setDate(limitDate.getDate() + 7);

    if (new Date() > limitDate) {
      console.error(`Tentativa de reembolso após o prazo para o pagamento ${paymentId}`);
      return NextResponse.json({ 
        error: "Reembolso permitido somente até 7 dias após a compra" 
      }, { status: 400 });
    }

    console.log(`Criando reembolso no Mercado Pago para o pagamento ${payment.mpPaymentId}`);
    
    // Criar reembolso no Mercado Pago
    const refundClient = new PaymentRefund(client);
    let mpRefund;
    
    try {
      // Calcular o valor total dos itens para reembolso
      const totalAmount = payment.items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
      
      mpRefund = await refundClient.create({
        payment_id: payment.mpPaymentId
      });
      console.log(`Reembolso criado no Mercado Pago: ${mpRefund.id}`);
    } catch (mpError: any) {
      console.error('Erro ao criar reembolso no Mercado Pago:', mpError);
      return NextResponse.json({ 
        error: `Falha ao processar reembolso: ${mpError.message || 'Erro desconhecido'}`,
        details: mpError.cause || undefined
      }, { status: 500 });
    }

    // Iniciar transação para garantir consistência dos dados
    const [refund] = await prisma.$transaction([
      // Registrar reembolso no banco
      prisma.refund.create({
        data: {
          paymentId,
          mpRefundId: mpRefund.id?.toString() ?? null,
          status: mpRefund.status!,
          amount: payment.amount,
        },
      }),
      
      // Atualizar status do pagamento para REFUNDED
      prisma.payment.update({
        where: { id: paymentId },
        data: { 
          status: 'REFUNDED',
          updatedAt: new Date()
        },
      }),
    ]);

    console.log(`Reembolso registrado com sucesso: ${refund.id}`);

    // Revogar acesso imediatamente
    try {
      console.log(`Iniciando remoção de acesso para ${payment.items.length} itens do usuário ${userId}`);
      
      await Promise.all(
        payment.items.map(async (item) => {
          if (item.itemType === 'COURSE' && item.courseId) {
            console.log(`Removendo acesso ao curso ${item.courseId} para o usuário ${userId}`);
            await prisma.enrollment.deleteMany({
              where: { userId, courseId: item.courseId }
            });
            console.log(`Acesso ao curso ${item.courseId} removido com sucesso`);
          } else if (item.itemType === 'JOURNEY' && item.journeyId) {
            console.log(`Removendo acesso à jornada ${item.journeyId} para o usuário ${userId}`);
            await prisma.enrollment.deleteMany({
              where: { userId, journeyId: item.journeyId }
            });
            console.log(`Acesso à jornada ${item.journeyId} removido com sucesso`);
          }
        })
      );
      
      console.log(`Acesso a todos os itens revogado com sucesso`);
    } catch (accessError) {
      // Mesmo se falhar em remover o acesso, registra o erro mas não falha a operação
      // O webhook vai tentar novamente quando o status do pagamento for atualizado
      console.error('Erro ao remover acesso após reembolso:', accessError);
    }

    return NextResponse.json({ 
      success: true, 
      data: {
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount,
        paymentId: refund.paymentId,
        items: payment.items.map(item => ({
          id: item.courseId || item.journeyId,
          type: item.itemType === 'COURSE' ? 'course' : 'journey',
          title: item.title,
          quantity: item.quantity,
          price: item.price
        }))
      },
      message: 'Reembolso processado com sucesso. O acesso aos itens foi revogado.'
    });
  } catch (err: any) {
    console.error('Erro ao processar reembolso:', err);
    
    // Se for um erro de validação do Prisma, retornar mensagem mais amigável
    if (err.code === 'P2002') {
      return NextResponse.json({ 
        error: "Já existe um reembolso em andamento para este pagamento"
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: "Erro interno ao processar o reembolso",
      details: process.env.NODE_ENV === 'development' ? {
        message: err.message,
        code: err.code,
        stack: err.stack
      } : undefined
    }, { status: 500 });
  }
}
