import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MercadoPagoConfig, PaymentRefund } from "mercadopago";

// Definir tipo para os itens no metadata
type PaymentItem = {
  id: string;
  type: 'course' | 'journey';
  quantity?: number;
};

type PaymentMetadata = {
  items?: PaymentItem[];
  [key: string]: any;
};

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

export async function POST(req: Request) {
  try {
    const { paymentId, userId } = await req.json();
    console.log(`Iniciando processo de reembolso para pagamento ${paymentId}, usuário ${userId}`);

    // Buscar pagamento com informações relacionadas
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        course: true,
        journey: true,
        refunds: true
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

    // 30 dias de limite para reembolso
    const limitDate = new Date(payment.createdAt);
    limitDate.setDate(limitDate.getDate() + 30);

    if (new Date() > limitDate) {
      console.error(`Tentativa de reembolso após o prazo para o pagamento ${paymentId}`);
      return NextResponse.json({ 
        error: "Reembolso permitido somente até 30 dias após a compra" 
      }, { status: 400 });
    }

    console.log(`Criando reembolso no Mercado Pago para o pagamento ${payment.mpPaymentId}`);
    
    // Criar reembolso no Mercado Pago
    const refundClient = new PaymentRefund(client);
    let mpRefund;
    
    try {
      mpRefund = await refundClient.create({
        payment_id: payment.mpPaymentId,
      });
      console.log(`Reembolso criado no Mercado Pago: ${mpRefund.id}`);
    } catch (mpError: any) {
      console.error('Erro ao criar reembolso no Mercado Pago:', mpError);
      return NextResponse.json({ 
        error: `Falha ao processar reembolso: ${mpError.message || 'Erro desconhecido'}` 
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
        data: { status: 'REFUNDED' },
      }),
    ]);

    console.log(`Reembolso registrado com sucesso: ${refund.id}`);

    // Revogar acesso imediatamente
    try {
      if (payment.itemType === "COURSE" && payment.courseId) {
        console.log(`Removendo acesso ao curso ${payment.courseId} para o usuário ${userId}`);
        await prisma.enrollment.deleteMany({
          where: {
            userId: userId,
            courseId: payment.courseId,
          },
        });
        console.log(`Acesso ao curso ${payment.courseId} removido com sucesso`);
      } else if (payment.itemType === "JOURNEY" && payment.journeyId) {
        console.log(`Removendo acesso à jornada ${payment.journeyId} para o usuário ${userId}`);
        await prisma.enrollment.deleteMany({
          where: {
            userId: userId,
            journeyId: payment.journeyId,
          },
        });
        console.log(`Acesso à jornada ${payment.journeyId} removido com sucesso`);
      } else if (payment.itemType === "MULTIPLE") {
        // Se for um pagamento múltiplo, remover acesso a todos os itens
        const metadata = payment.metadata as PaymentMetadata | null;
        const items = metadata?.items || [];
        
        console.log(`Removendo acesso a ${items.length} itens para o usuário ${userId}`);
        
        for (const item of items) {
          if (item.type === 'course') {
            await prisma.enrollment.deleteMany({
              where: { userId, courseId: item.id }
            });
          } else if (item.type === 'journey') {
            await prisma.enrollment.deleteMany({
              where: { userId, journeyId: item.id }
            });
          }
        }
        console.log(`Acesso a ${items.length} itens removido com sucesso`);
      }
    } catch (accessError) {
      // Mesmo se falhar em remover o acesso, registra o erro mas não falha a operação
      // O webhook vai tentar novamente quando o status do pagamento for atualizado
      console.error('Erro ao remover acesso após reembolso:', accessError);
    }

    return NextResponse.json({ 
      success: true, 
      refund,
      message: 'Reembolso processado com sucesso. O acesso aos itens foi revogado.'
    });
  } catch (err: any) {
    console.error('Erro ao processar reembolso:', err);
    return NextResponse.json({ 
      error: "Erro interno ao processar o reembolso",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }, { status: 500 });
  }
}
