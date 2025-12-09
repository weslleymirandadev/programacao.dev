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

    // Log items received
    console.log('Items recebidos do frontend:', JSON.stringify(items, null, 2));

    // Detect item types if not provided by checking the database
    const itemsWithTypes = await Promise.all(items.map(async (item) => {
      // If type is already provided, normalize it
      if (item.type) {
        const normalizedType = item.type === 'course' ? 'curso' : item.type === 'journey' ? 'jornada' : item.type;
        
        // Validate that the item exists with the provided type
        if (normalizedType === 'curso') {
          const course = await prisma.course.findUnique({ where: { id: item.id }, select: { id: true } });
          if (!course) {
            throw new Error(`Curso com ID ${item.id} não encontrado no banco de dados`);
          }
        } else if (normalizedType === 'jornada') {
          const journey = await prisma.journey.findUnique({ where: { id: item.id }, select: { id: true } });
          if (!journey) {
            throw new Error(`Jornada com ID ${item.id} não encontrada no banco de dados`);
          }
        }
        
        return {
          ...item,
          type: normalizedType
        };
      }

      // If type is missing, try to detect it by checking both tables
      console.log(`Tipo não fornecido para item ${item.id}, detectando automaticamente...`);
      
      const [course, journey] = await Promise.all([
        prisma.course.findUnique({ where: { id: item.id }, select: { id: true } }),
        prisma.journey.findUnique({ where: { id: item.id }, select: { id: true } })
      ]);

      if (course) {
        console.log(`Item ${item.id} identificado como CURSO`);
        return { ...item, type: 'curso' };
      } else if (journey) {
        console.log(`Item ${item.id} identificado como JORNADA`);
        return { ...item, type: 'jornada' };
      } else {
        // Tentar buscar em CartItem para ver se é um ID de carrinho incorreto
        const cartItem = await prisma.cartItem.findUnique({
          where: { id: item.id },
          select: { courseId: true, journeyId: true }
        });
        
        if (cartItem) {
          const actualId = cartItem.courseId || cartItem.journeyId;
          if (actualId) {
            throw new Error(`ID fornecido (${item.id}) é um ID de item do carrinho. Use o ID do curso/jornada (${actualId}) em vez disso.`);
          }
        }
        
        throw new Error(`Item ${item.id} não encontrado nem como curso nem como jornada. Verifique se o ID está correto.`);
      }
    }));

    console.log('Items com tipos detectados:', JSON.stringify(itemsWithTypes, null, 2));

    // Normalize item types (frontend sends 'course'/'journey', API expects 'curso'/'jornada')
    const normalizedItems = itemsWithTypes;

    // Validate that all items exist in the database
    const courseIds = normalizedItems.filter(item => item.type === 'curso').map(item => item.id);
    const journeyIds = normalizedItems.filter(item => item.type === 'jornada').map(item => item.id);

    console.log('Course IDs para validar:', courseIds);
    console.log('Journey IDs para validar:', journeyIds);

    // Check if courses exist
    if (courseIds.length > 0) {
      const existingCourses = await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true, price: true }
      });
      
      const existingCourseIds = new Set(existingCourses.map(c => c.id));
      const missingCourses = courseIds.filter(id => !existingCourseIds.has(id));
      
      if (missingCourses.length > 0) {
        return NextResponse.json(
          { error: `Cursos não encontrados: ${missingCourses.join(', ')}` },
          { status: 404 }
        );
      }
    }

    // Check if journeys exist
    if (journeyIds.length > 0) {
      console.log('Validando jornadas:', journeyIds);
      const existingJourneys = await prisma.journey.findMany({
        where: { id: { in: journeyIds } },
        select: { id: true, title: true, price: true }
      });
      
      console.log('Jornadas encontradas no banco:', existingJourneys.map(j => j.id));
      const existingJourneyIds = new Set(existingJourneys.map(j => j.id));
      const missingJourneys = journeyIds.filter(id => !existingJourneyIds.has(id));
      
      if (missingJourneys.length > 0) {
        console.error('Jornadas não encontradas:', missingJourneys);
        return NextResponse.json(
          { error: `Jornadas não encontradas: ${missingJourneys.join(', ')}` },
          { status: 404 }
        );
      }
    }

    // Validate and enrich items with database data
    const enrichedItems = normalizedItems.map(item => ({
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
          category_id: item.type,
          ...(item.imageUrl && { picture_url: item.imageUrl }),
        })),
      },
      statement_descriptor: "PROGRAMACAO.DEV",
      binary_mode: true,
    };

    // Log para debug
    console.log('Criando pagamento com método:', method);
    if (method === 'pix') {
      console.log('Dados do pagamento PIX:', {
        transaction_amount: calculatedTotalInReais,
        payer_email: payer.email,
        payer_cpf: payer.cpf?.replace(/\D/g, ''),
      });
    }

    let response;
    try {
      response = await payment.create({
        body: mpData as any,
        requestOptions: {
          idempotencyKey: crypto.randomUUID(),
          meliSessionId: req.headers.get('X-meli-session-id')!
        }
      });
      
      console.log('Resposta do Mercado Pago:', {
        id: response.id,
        status: response.status,
        payment_method_id: response.payment_method_id,
        has_point_of_interaction: !!response.point_of_interaction
      });
    } catch (mpError: any) {
      console.error('Erro ao criar pagamento no Mercado Pago:', mpError);
      console.error('Detalhes do erro:', {
        message: mpError.message,
        cause: mpError.cause,
        status: mpError.status,
        statusCode: mpError.statusCode
      });
      return NextResponse.json(
        {
          error: "Erro ao processar pagamento no gateway",
          details: process.env.NODE_ENV === 'development' ? mpError.message : undefined
        },
        { status: 500 }
      );
    }

    if (!response?.id) {
      console.error('Resposta do Mercado Pago sem ID:', response);
      return NextResponse.json(
        { error: "Falha ao processar pagamento no gateway" },
        { status: 500 }
      );
    }

    const mpPaymentId = response.id?.toString()!;

    // Double-check that all items still exist before creating payment
    console.log('Revalidando itens antes de criar pagamento...');
    for (const item of enrichedItems) {
      if (item.type === 'curso') {
        const course = await prisma.course.findUnique({
          where: { id: item.id },
          select: { id: true }
        });
        if (!course) {
          console.error(`Curso não encontrado antes de criar pagamento: ${item.id}`);
          return NextResponse.json(
            { error: `Curso não encontrado: ${item.id}` },
            { status: 404 }
          );
        }
      } else if (item.type === 'jornada') {
        const journey = await prisma.journey.findUnique({
          where: { id: item.id },
          select: { id: true }
        });
        if (!journey) {
          console.error(`Jornada não encontrada antes de criar pagamento: ${item.id}`);
          return NextResponse.json(
            { error: `Jornada não encontrada: ${item.id}` },
            { status: 404 }
          );
        }
      }
    }

    // Create payment record with items in a transaction
    let paymentRecord;
    
    // Preparar metadata com o método correto
    const paymentMetadata = {
      userId,
      method: method, // Garantir que o método seja salvo corretamente
      installments,
      items: enrichedItems,
      ...(response.point_of_interaction?.transaction_data && {
        qr_code: response.point_of_interaction.transaction_data.qr_code,
        qr_code_base64: response.point_of_interaction.transaction_data.qr_code_base64,
        ticket_url: response.point_of_interaction.transaction_data.ticket_url
      })
    };
    
    console.log('Metadata que será salvo no pagamento:', JSON.stringify(paymentMetadata, null, 2));
    console.log('Método do pagamento:', method);
    
    paymentRecord = await prisma.$transaction(async (prisma) => {
      // 1. Create the payment
      const payment = await prisma.payment.create({
        data: {
          userId,
          mpPaymentId,
          status: "PENDING",
          amount: calculatedTotalInCents,
          metadata: paymentMetadata,
          // Create related payment items
          items: {
            create: enrichedItems.map(item => {
              const isCourse = item.type === 'curso';
              const price = Number(item.price); // Ensure it's a number
              if (isNaN(price)) {
                throw new Error(`Preço inválido para ${isCourse ? 'curso' : 'jornada'}: ${item.id}`);
              }

              const paymentItemData: any = {
                itemType: (isCourse ? 'COURSE' : 'JOURNEY') as 'COURSE' | 'JOURNEY',
                ...(isCourse
                  ? { courseId: item.id }
                  : { journeyId: item.id }
                ),
                quantity: item.quantity,
                price: price, // Now definitely a number
                title: item.title,
                description: isCourse ? 'Curso' : 'Jornada',
              };

              console.log(`Criando PaymentItem:`, {
                type: isCourse ? 'COURSE' : 'JOURNEY',
                id: item.id,
                courseId: isCourse ? item.id : undefined,
                journeyId: !isCourse ? item.id : undefined,
              });

              return paymentItemData;
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