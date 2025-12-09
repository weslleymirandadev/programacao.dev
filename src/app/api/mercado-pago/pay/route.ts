import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import prisma from "@/lib/prisma";

type PaymentItemType = 'COURSE' | 'JOURNEY' | 'MULTIPLE';

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: {
    timeout: 10000,
    idempotencyKey: crypto.randomUUID()
  }
});

interface Item {
  id: string;
  type: 'course' | 'journey';
  title: string;
  description?: string;
  quantity: number;
  price: number;
  imageUrl?: string;
}

export async function POST(req: Request) {
  try {
    const {
      method,
      installments = 1,
      token,
      payer,
      userId,
      items,
      total,
      issuer_id,
    } = await req.json();

    if (!userId) {
      return NextResponse.json(
        { error: "ID do usuário é obrigatório" },
        { status: 400 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Nenhum item no carrinho" },
        { status: 400 }
      );
    }

    // Buscar informações adicionais dos itens no banco de dados
    const enrichedItems = await Promise.all(
      items.map(async (item: Item) => {
        if (item.type === 'course') {
          const course = await prisma.course.findUnique({
            where: { id: item.id },
            select: { title: true, price: true, imageUrl: true }
          });
          return {
            ...item,
            title: course?.title || item.title,
            price: course?.price || item.price,
            imageUrl: course?.imageUrl
          };
        } else {
          const journey = await prisma.journey.findUnique({
            where: { id: item.id },
            select: { title: true, price: true, imageUrl: true }
          });
          return {
            ...item,
            title: journey ? `Jornada: ${journey.title}` : item.title,
            price: journey?.price || item.price,
            imageUrl: journey?.imageUrl
          };
        }
      })
    );

    // Calcular o total se não fornecido (em centavos)
    const calculatedTotalInCents = total || enrichedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    // Mercado Pago espera valores em reais (float), então convertemos de centavos para reais
    const calculatedTotalInReais = calculatedTotalInCents / 100;
    const description = enrichedItems.length === 1
      ? enrichedItems[0].title
      : `${enrichedItems.length} itens no carrinho`;

    const payment = new Payment(mp);

    const mpData = {
      transaction_amount: calculatedTotalInReais,
      payment_method_id: method,
      installments: method !== 'pix' ? installments : 1,
      ...(issuer_id && { issuer_id }),
      ...(token && { token }),
      ...(method === "pix" && {
        transaction_details: {
          financial_institution: "pix",
        },
      }),
      payer: {
        email: payer.email,
        first_name: payer.firstName || payer.name?.split(' ')[0] || '',
        last_name: payer.lastName || payer.name?.split(' ').slice(1).join(' ') || '',
        identification: {
          type: 'CPF',
          number: payer.cpf.replace(/\D/g, '')
        },
        ...(payer.zipCode && {
          address: {
            zip_code: payer.zipCode,
            street_name: payer.streetName || '',
            street_number: payer.streetNumber || '',
            neighborhood: payer.neighborhood || '',
            city: payer.city || '',
            federal_unit: payer.state || ''
          }
        })
      },
      description,
      external_reference: `order-${Date.now()}`,
      notification_url: `${process.env.NEXT_PUBLIC_URL}/api/mercado-pago/webhook`,
      metadata: {
        userId,
        items: enrichedItems.map(item => ({
          id: item.id,
          type: item.type,
          title: item.title,
          price: item.price,
          quantity: 1
        })),
      },
      additional_info: {
        items: enrichedItems.map(item => ({
          id: item.id,
          title: item.title,
          description: item.type === 'course' ? 'Curso' : 'Jornada',
          quantity: item.quantity,
          // Mercado Pago espera valores em reais, converter de centavos
          unit_price: item.price / 100,
          category_id: item.type.toUpperCase(),
          ...(item.imageUrl && { picture_url: item.imageUrl }),
        })),
      },
      statement_descriptor: "PROGRAMACAO.DEV",
      binary_mode: true,
    };

    const response = await payment.create({
      body: mpData as any, requestOptions: {
        idempotencyKey: crypto.randomUUID(),
        meliSessionId: req.headers.get('X-meli-session-id')!
      }
    });

    // Salvar no banco de dados usando upsert para evitar duplicação
    const mpPaymentId = response.id?.toString()!;
    // Get all course and journey items
    const courseItems = enrichedItems.filter(item => item.type === 'course');
    const journeyItems = enrichedItems.filter(item => item.type === 'journey');
    
    // Get all course and journey IDs
    const courseIds = courseItems.map(item => item.id);
    const journeyIds = journeyItems.map(item => item.id);

    // Determine the main item type for the payment
    const itemType: PaymentItemType = enrichedItems.length === 1
      ? enrichedItems[0].type === 'course' ? 'COURSE' : 'JOURNEY'
      : 'MULTIPLE';

    const paymentData = {
      userId,
      status: "PENDING" as const,
      amount: calculatedTotalInCents,
      itemType,
      // For backward compatibility, set the first course/journey ID if it's a single type purchase
      courseId: courseItems.length > 0 ? courseItems[0].id : null,
      journeyId: journeyItems.length > 0 ? journeyItems[0].id : null,
      metadata: {
        userId,
        method,
        installments,
        // Store all items with their details
        items: enrichedItems,
        // Store all course and journey IDs for reference
        courseIds,
        journeyIds,
        ...(response.point_of_interaction?.transaction_data && {
          qr_code: response.point_of_interaction.transaction_data.qr_code,
          qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
          ticket_url: response.point_of_interaction.transaction_data.ticket_url
        })
      },
    };

    const paymentRecord = await prisma.payment.upsert({
      where: { mpPaymentId },
      create: {
        ...paymentData,
        mpPaymentId,
      },
      update: {
        // Atualiza apenas os campos que podem mudar em caso de tentativa de recriação
        status: paymentData.status,
        metadata: paymentData.metadata,
        createdAt: new Date()
      },
    });

    if (response.point_of_interaction?.transaction_data) {
      await prisma.payment.update({
        where: { id: paymentRecord.id },
        data: {
          metadata: {
            ...paymentData.metadata,
            qr_code: response.point_of_interaction.transaction_data.qr_code,
            qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
            ticket_url: response.point_of_interaction.transaction_data.ticket_url
          }
        }
      });
    }

    return NextResponse.json({
      id: response.id,
      status: response.status,
      status_detail: response.status_detail,
      point_of_interaction: response.point_of_interaction,
      payment_record: paymentRecord
    });

  } catch (err) {
    console.error('Erro ao processar pagamento:', err);
    return NextResponse.json(
      { error: "Erro ao processar pagamento", details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}