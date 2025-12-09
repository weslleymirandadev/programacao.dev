'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaCopy, FaExclamationTriangle, FaSpinner } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { useCart } from "@/context/CartContext";

interface Payment {
  id: string;
  status: string;
  metadata: string | {
    method: string;
    items: Array<{
      id: string;
      type: string;
      title: string;
      price: number;
      quantity: number;
    }>;
    qr_code?: string;
    qr_code_base64?: string;
    ticket_url?: string;
  };
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div>Carregando...</div>}>
      <SuccessPageContent />
    </Suspense>
  );
}

function SuccessPageContent() {
  const searchParams = useSearchParams();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { clearCart } = useCart();

  const paymentId = searchParams.get('payment_id');

  useEffect(() => {
    const fetchPayment = async () => {
      if (!paymentId) {
        setError('ID do pagamento não encontrado');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/payments/${paymentId}`, {
          credentials: 'include', // Important for sending cookies
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Erro ao buscar informações do pagamento');
        }

        const data = await response.json();
        console.log('Dados do pagamento recebidos:', data);
        console.log('Metadata do pagamento:', data.metadata);
        console.log('Método do pagamento:', data.metadata?.method);
        setPayment(data);
        setError(null);
      } catch (err: any) {
        console.error('Erro ao buscar pagamento:', err);
        setError(err.message || 'Não foi possível carregar as informações do pagamento');
      } finally {
        setLoading(false);
      }
    };

    fetchPayment();

    // Set up polling to check payment status
    const intervalId = setInterval(fetchPayment, 10000); // Check every 10 seconds

    return () => clearInterval(intervalId);
  }, [paymentId]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Código copiado para a área de transferência!');
  };

  useEffect(() => {
    if (payment?.status === "approved") {
      clearCart();
    }
  }, [payment?.status, clearCart]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <FaSpinner className="animate-spin h-12 w-12 text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Carregando informações do pagamento...</p>
        </div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-6 max-w-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
            <FaExclamationTriangle className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-gray-900">Erro</h1>
          <p className="mt-2 text-gray-600">{error || 'Pagamento não encontrado'}</p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Voltar para a página inicial
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Check if payment method is PIX (handle both string and object metadata)
  const metadata = typeof payment.metadata === 'string' 
    ? JSON.parse(payment.metadata) 
    : (payment.metadata || {});
  
  const isPix = metadata?.method === 'pix' || metadata?.method === 'PIX';
  const isPending = payment.status === 'PENDING' || payment.status === 'IN_PROCESS';
  const isApproved = payment.status === 'APPROVED';
  
  console.log('Verificação PIX:', {
    rawMetadata: payment.metadata,
    parsedMetadata: metadata,
    method: metadata?.method,
    isPix,
    hasQrCode: !!metadata?.qr_code,
    hasQrCodeBase64: !!metadata?.qr_code_base64
  });

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="px-4 py-5 sm:px-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              {isApproved ? 'Pagamento Aprovado!' : 'Aguardando Confirmação do Pagamento'}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              {isApproved
                ? 'Seu pagamento foi aprovado com sucesso!'
                : 'Estamos aguardando a confirmação do seu pagamento.'}
            </p>
          </div>

          <div className="border-t border-gray-200 px-4 py-5 sm:p-0">
            <dl className="sm:divide-y sm:divide-gray-200">
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Status</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                    ${isApproved ? 'bg-green-100 text-green-800' :
                      isPending ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'}`}>
                    {payment.status === 'APPROVED' ? 'Aprovado' :
                      payment.status === 'PENDING' ? 'Pendente' :
                        payment.status === 'IN_PROCESS' ? 'Processando' :
                          payment.status}
                  </span>
                </dd>
              </div>

              {isPix && isPending && metadata?.qr_code && (
                <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-500">PIX</dt>
                  <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                    <div className="flex flex-col items-center space-y-4">
                      {metadata?.qr_code_base64 && (
                        <div className="p-4 bg-white rounded-lg border border-gray-200">
                          <img
                            src={`data:image/png;base64,${metadata.qr_code_base64}`}
                            alt="QR Code PIX"
                            className="w-64 h-64"
                          />
                        </div>
                      )}

                      {metadata?.qr_code && (
                        <div className="w-full">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Código PIX (copie e cole no seu banco)
                          </label>
                          <div className="mt-1 flex rounded-md shadow-sm">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                readOnly
                                value={metadata.qr_code}
                                className="focus:ring-blue-500 focus:border-blue-500 block w-full rounded-none rounded-l-md sm:text-sm border-gray-300"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(metadata.qr_code || '')}
                              className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-r-md"
                            >
                              <FaCopy className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </dd>
                </div>
              )}

              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Método de pagamento</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  {isPix ? 'PIX' : 'Cartão de Crédito'}
                </dd>
              </div>

              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-500">Itens</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                  <ul className="border border-gray-200 rounded-md divide-y divide-gray-200">
                    {(metadata?.items || []).map((item: any, index: number) => (
                      <li key={index} className="pl-3 pr-4 py-3 flex items-center justify-between text-sm">
                        <div className="w-0 flex-1 flex items-center">
                          <span className="ml-2 flex-1 w-0 truncate">
                            {item.title}
                          </span>
                        </div>
                        <div className="ml-4 shrink-0">
                          <span className="font-medium text-gray-900">
                            R$ {(item.price * item.quantity / 100).toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-gray-50 px-4 py-4 sm:px-6 flex justify-end">
            {isApproved ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Acessar meus cursos
              </Link>
            ) : (
              <div className="text-sm text-gray-500">
                <div className="flex items-center">
                  <FaSpinner className="animate-spin h-4 w-4 mr-2" />
                  Atualizando automaticamente...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}