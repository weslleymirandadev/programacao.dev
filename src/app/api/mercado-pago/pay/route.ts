import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import prisma from "@/lib/prisma";

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  options: {
    timeout: 10000,
    idempotencyKey: crypto.randomUUID()
  }
});

interface Item {
  id: string;
  type: 'curso' | 'jornada';
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

    // Validate and enrich items with database data
    const enrichedItems = items.map(item => ({
      ...item,
      // Ensure required fields have default values
      title: item.title || (item.type === 'curso' ? 'Curso' : 'Jornada'),
      price: item.price || 0,
      quantity: item.quantity || 1,
      imageUrl: item.imageUrl || ''
    }));


    // Calcular o total se não fornecido (em centavos)
    const calculatedTotalInCents = total || enrichedItems.reduce((sum, item) => sum + (item.price! * item.quantity), 0);
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
          description: item.type === 'curso' ? 'Curso' : 'Jornada',
          quantity: item.quantity,
          // Mercado Pago espera valores em reais, converter de centavos
          unit_price: item.price! / 100,
          category_id: item.type.toUpperCase(),
          ...(item.imageUrl && { picture_url: item.imageUrl }),
        })),
      },
      statement_descriptor: "PROGRAMACAO.DEV",
      binary_mode: true,
    };

    let response;
    try {
      response = await payment.create({
        body: mpData as any,
        requestOptions: {
          idempotencyKey: crypto.randomUUID(),
          meliSessionId: req.headers.get('X-meli-session-id')!
        }
      });
    } catch (mpError: any) {
      console.error('Erro ao criar pagamento no Mercado Pago:', mpError);
      return NextResponse.json(
        {
          error: "Erro ao processar pagamento no gateway",
          details: process.env.NODE_ENV === 'development' ? mpError.message : undefined
        },
        { status: 500 }
      );
    }

    if (!response?.id) {
      return NextResponse.json(
        { error: "Falha ao processar pagamento no gateway" },
        { status: 500 }
      );
    }

    const mpPaymentId = response.id?.toString()!;

    // Create payment record with items in a transaction
    let paymentRecord;
    paymentRecord = await prisma.$transaction(async (prisma) => {
      // 1. Create the payment
      const payment = await prisma.payment.create({
        data: {
          userId,
          mpPaymentId,
          status: "PENDING",
          amount: calculatedTotalInCents,
          metadata: {
            userId,
            method,
            installments,
            items: enrichedItems,
            ...(response.point_of_interaction?.transaction_data && {
              qr_code: response.point_of_interaction.transaction_data.qr_code,
              qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
              ticket_url: response.point_of_interaction.transaction_data.ticket_url
            })
          },
          // Create related payment items
          items: {
            create: enrichedItems.map(item => {
              const isCourse = item.type === 'curso';
              const price = Number(item.price); // Ensure it's a number
              if (isNaN(price)) {
                throw new Error(`Preço inválido para ${isCourse ? 'curso' : 'jornada'}: ${item.id}`);
              }

              return {
                itemType: isCourse ? 'COURSE' : 'JOURNEY',
                ...(isCourse
                  ? { courseId: item.id }
                  : { journeyId: item.id }
                ),
                quantity: item.quantity,
                price: price, // Now definitely a number
                title: item.title,
                description: isCourse ? 'Curso' : 'Jornada',
              };
            })
          }
        },
        include: {
          items: true // Include the created items in the response
        }
      });

      return payment;
    });

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