// src/app/dashboard/cursos/[curso_id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FaClock, FaCheckCircle, FaExclamationCircle, FaChevronRight, FaCreditCard, FaMoneyBillWave, FaTimes } from 'react-icons/fa';
import { IoIosWarning } from "react-icons/io";
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import * as Dialog from '@radix-ui/react-dialog';

interface LessonProgress {
  id: string;
  lessonId: string;
  completed: boolean;
  lastAccessed: Date | null;
}

interface Module {
  id: string;
  title: string;
  order: number;
  lessons: Array<{
    id: string;
    title: string;
    order: number;
    duration: number;
    progress?: LessonProgress;
  }>;
}

interface Course {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  modules: Module[];
}

interface Payment {
  id: string;
  status: string;
  amount: number;
  createdAt: Date;
  itemType: 'COURSE' | 'JOURNEY';
  courseId: string | null;
  journeyId: string | null;
  refunds: Array<{
    id: string;
    status: string;
  }>;
}

interface Enrollment {
  id: string;
  startDate: Date;
  endDate: Date | null;
  course?: {
    id: string;
    title: string;
    description: string;
    imageUrl: string | null;
    modules: Module[];
  };
  payments: Payment[];
  progress: {
    completedLessons: number;
    totalLessons: number;
    lastAccessed: Date | null;
  };
}

export default function DashboardCoursePage({ params }: { params: Promise<{ curso_id: string }> }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'conteudo' | 'pagamento'>('conteudo');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundConfirmationText, setRefundConfirmationText] = useState('');
  const [refundError, setRefundError] = useState('');
  const [refundId, setRefundId] = useState<string | null>(null);
  const [isCheckingRefund, setIsCheckingRefund] = useState(false);
  const [cursoId, setCursoId] = useState<string | null>(null);

  // Resolver params uma vez
  useEffect(() => {
    params.then(p => setCursoId(p.curso_id));
  }, [params]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      fetchCourseData();
    }
  }, [status, router]);

  const fetchCourseData = async () => {
    try {
      const [courseRes, enrollmentRes] = await Promise.all([
        fetch(`/api/courses/${(await params).curso_id}`),
        fetch('/api/user/enrollments'),
      ]);

      if (!courseRes.ok) throw new Error('Failed to fetch course');
      const courseData = await courseRes.json();

      let enrollmentData = null;
      if (enrollmentRes.ok) {
        const { courses } = await enrollmentRes.json();
        const courseEnrollment = courses.find(async (c: any) => c.id === (await params).curso_id);

        if (courseEnrollment) {
          // Buscar pagamentos para esta matrícula
          const paymentsRes = await fetch(`/api/payments?courseId=${courseEnrollment.id}`);
          if (paymentsRes.ok) {
            const payments = await paymentsRes.json();
            enrollmentData = {
              ...courseEnrollment,
              payments: payments || []
            };
          }
        }
      }

      setCourse(courseData);
      setEnrollment(enrollmentData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar os dados do curso');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefund = async () => {
    if (!enrollment?.payments?.[0]) return;

    if (!refundModalOpen) {
      setRefundModalOpen(true);
      return;
    }

    // Verifica se o texto de confirmação está correto
    if (refundConfirmationText.toLowerCase() !== 'quero reembolsar') {
      setRefundError('Por favor, digite exatamente "quero reembolsar" para confirmar');
      return;
    }

    setIsProcessingRefund(true);
    try {
      const response = await fetch('/api/mercado-pago/refund/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentId: enrollment.payments[0].id,
          userId: session?.user.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao processar reembolso');
      }

      const result = await response.json();
      const refundIdFromResponse = result.data?.refundId;

      // Atualiza o status do pagamento para refletir o reembolso
      const updatedEnrollment = { ...enrollment };
      if (updatedEnrollment.payments[0]) {
        updatedEnrollment.payments[0].refunds = [{
          id: refundIdFromResponse || 'pending-refund',
          status: result.data?.status || 'PENDING'
        }];
        setEnrollment(updatedEnrollment);
      }

      // Iniciar verificação do reembolso
      if (refundIdFromResponse) {
        setRefundId(refundIdFromResponse);
        setIsCheckingRefund(true);
      }

      setRefundModalOpen(false);
      setRefundConfirmationText('');
      setRefundError('');
      toast.success('Solicitação de reembolso enviada com sucesso! Verificando status...');
    } catch (error: any) {
      console.error('Refund error:', error);
      toast.error(error.message || 'Erro ao solicitar reembolso');
    } finally {
      setIsProcessingRefund(false);
    }
  };

  // Add this effect after the existing useEffect
  useEffect(() => {
    // If we're done loading and there's no enrollment data, redirect to dashboard
    if (!isLoading && status === 'authenticated' && !enrollment) {
      toast.error('Você não tem acesso a este curso');
      router.push('/dashboard');
    }
  }, [isLoading, status, enrollment, router]);

  // Verificar status do reembolso periodicamente
  useEffect(() => {
    if (!isCheckingRefund || !refundId || !enrollment?.payments?.[0]) return;

    let isMounted = true;

    const checkRefundStatus = async () => {
      if (!isMounted || !cursoId) return;

      try {
        // Primeiro, verificar se o enrollment ainda existe (acesso foi revogado)
        const enrollmentResponse = await fetch('/api/user/enrollments');
        if (enrollmentResponse.ok) {
          const { courses } = await enrollmentResponse.json();
          const hasAccess = courses.some((c: any) => c.id === cursoId);
          
          if (!hasAccess) {
            if (isMounted) {
              setIsCheckingRefund(false);
              setRefundId(null);
              toast.success('Reembolso processado. Você não tem mais acesso a este curso.');
              router.push('/dashboard');
            }
            return;
          }
        }

        // Buscar os pagamentos atualizados para verificar o status do reembolso
        const paymentsResponse = await fetch(`/api/payments?courseId=${cursoId}`);
        if (paymentsResponse.ok && isMounted) {
          const payments = await paymentsResponse.json();
          const payment = payments.find((p: any) => p.id === enrollment.payments[0].id);
          
          if (payment && payment.refunds && Array.isArray(payment.refunds)) {
            const refund = payment.refunds.find((r: any) => r.id === refundId);
            
            if (refund) {
              const isCompleted = refund.status === 'COMPLETED' || refund.status === 'APPROVED';
              
              if (isCompleted && isMounted) {
                setIsCheckingRefund(false);
                setRefundId(null);
                toast.success('Reembolso confirmado! Você será redirecionado.');
                
                // Pequeno delay para o usuário ver a mensagem
                setTimeout(() => {
                  if (isMounted) {
                    router.push('/dashboard');
                  }
                }, 1500);
                return;
              }
            }
          }
        }
      } catch (error) {
        console.error('Erro ao verificar status do reembolso:', error);
      }
    };

    // Verificar imediatamente e depois a cada 3 segundos
    checkRefundStatus();
    const intervalId = setInterval(checkRefundStatus, 3000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [isCheckingRefund, refundId, enrollment, router, cursoId]);

  const closeRefundModal = () => {
    setRefundModalOpen(false);
    setRefundConfirmationText('');
    setRefundError('');
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!course) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-center py-12">
          <FaExclamationCircle className="mx-auto h-12 w-12 text-red-500" />
          <h2 className="mt-4 text-2xl font-bold">Curso não encontrado</h2>
          <p className="mt-2 text-gray-600">O curso que você está procurando não existe ou você não tem acesso a ele.</p>
        </div>
      </div>
    );
  }

  const payment = enrollment?.payments?.[0];
  const refund = payment?.refunds?.[0];
  const paymentDate = payment ? new Date(payment.createdAt) : null;
  const refundLimitDate = paymentDate ? new Date(paymentDate.getTime() + 30 * 24 * 60 * 60 * 1000) : null;

  const isRefundable = payment &&
    new Date() < new Date(new Date(payment.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000) &&
    !payment.refunds?.some(refund => ['APPROVED', 'PENDING'].includes(refund.status));

  const totalLessons = (course.modules || []).reduce(
    (total, module) => total + (module.lessons?.length || 0),
    0
  );

  const completedLessons = (course.modules || []).reduce(
    (total, module) =>
      total + (module.lessons?.filter(lesson => lesson.progress?.completed).length || 0),
    0
  );

  const progressPercentage = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : 0;

  return (
    <>
      <div className="container mx-auto p-4 space-y-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6">
            {/* Course header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{course.title}</h1>
                <p className="text-gray-600">
                  Ministrado por Clara
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <span className="text-sm text-gray-500">Progresso</span>
                  <div className="text-lg font-semibold">
                    {progressPercentage}%
                  </div>
                </div>
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600"
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-6 border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('conteudo')}
                  className={`${activeTab === 'conteudo'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  Conteúdo do Curso
                </button>
                <button
                  onClick={() => setActiveTab('pagamento')}
                  className={`${activeTab === 'pagamento'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                >
                  Detalhes do Pagamento
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'conteudo' ? (
              <div className="mt-6">
                <div className="prose max-w-none">
                  <p className="text-gray-700">{course.description}</p>
                </div>

                <div className="mt-8">
                  <h2 className="text-xl font-semibold text-gray-900">Conteúdo do Curso</h2>
                  <div className="mt-4 space-y-4">
                    {(course.modules || []).map((module) => (
                      <div key={module.id} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 font-medium">
                          Módulo {module.order}: {module.title}
                        </div>
                        <div className="divide-y">
                          {module.lessons?.map((lesson) => (
                            <button
                              key={lesson.id}
                              onClick={() => router.push(`/dashboard/cursos/${course.id}/aula/${lesson.id}`)}
                              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 text-left"
                            >
                              <div className="flex items-center gap-3">
                                {lesson.progress?.completed ? (
                                  <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                                    <FaCheckCircle className="h-3.5 w-3.5 text-green-600" />
                                  </div>
                                ) : (
                                  <div className="h-5 w-5 rounded-full border-2 border-gray-300 shrink-0"></div>
                                )}
                                <span>{lesson.title}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">
                                  {Math.floor(lesson.duration / 60)}:
                                  {(lesson.duration % 60).toString().padStart(2, '0')} min
                                </span>
                                <FaChevronRight className="h-4 w-4 text-gray-400" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-6">Detalhes do Pagamento</h2>

                {payment ? (
                  <div className="space-y-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-blue-100 rounded-full">
                          <FaCreditCard className="h-5 w-5 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">Informações do Pagamento</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Status do Pagamento</p>
                          <div className="flex items-center gap-2 mt-1">
                            {payment.status === 'APPROVED' ? (
                              <FaCheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <FaTimes className="h-5 w-5" />
                            )}
                            <span className="capitalize">
                              {payment.status === 'APPROVED' ? 'Pago' : payment.status.toLowerCase()}
                            </span>
                          </div>
                        </div>

                        <div>
                          <p className="text-sm text-gray-500">Data do Pagamento</p>
                          <p className="mt-1">
                            {paymentDate ? format(paymentDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'N/A'}
                          </p>
                        </div>

                        <div>
                          <p className="text-sm text-gray-500">Valor Pago</p>
                          <p className="mt-1">
                            {new Intl.NumberFormat('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            }).format((payment.amount || 0) / 100)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Seção de Reembolso */}
                    <div className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                          <FaMoneyBillWave className="h-5 w-5 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">Solicitar Reembolso</h3>
                      </div>

                      <div className="p-4">
                        {refund ? (
                          <div className="text-center py-4">
                            <FaCheckCircle className="mx-auto h-8 w-8 text-green-500 mb-2" />
                            <h4 className="font-medium text-gray-900">
                              {refund.status === 'PENDING'
                                ? 'Solicitação de reembolso em andamento'
                                : 'Reembolso processado com sucesso'}
                            </h4>
                            <p className="text-sm text-gray-500 mt-1">
                              {refund.status === 'PENDING'
                                ? 'Sua solicitação está sendo processada.'
                                : 'O valor será estornado no prazo de até 30 dias úteis.'}
                            </p>
                          </div>
                        ) : isRefundable ? (
                          <div>
                            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg mb-4">
                              <FaExclamationCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                              <div>
                                <h4 className="font-medium text-blue-800">Reembolso Disponível</h4>
                                <h2 className="text-red-500 bg-red-200 rounded-md p-2 inline-flex items-center gap-2"><IoIosWarning />Você perderá acesso ao material do curso!</h2>
                                <p className="text-sm text-blue-700 mt-1">
                                  Você pode solicitar o reembolso deste curso até{' '}
                                  {refundLimitDate && format(refundLimitDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={handleRefund}
                              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                              Solicitar Reembolso
                            </button>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <FaExclamationCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                            <h4 className="font-medium text-gray-900">Reembolso Indisponível</h4>
                            <p className="text-sm text-gray-500 mt-1">
                              O prazo para solicitar reembolso encerrou em {refundLimitDate && format(refundLimitDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              O prazo para solicitar reembolso encerrou em {refundLimitDate && format(refundLimitDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FaExclamationCircle className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900">Nenhum pagamento encontrado</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Não foi possível encontrar informações de pagamento para este curso.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div><Dialog.Root open={refundModalOpen} onOpenChange={!isProcessingRefund ? closeRefundModal : undefined}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg p-6 w-full max-w-md z-50 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <Dialog.Title className="text-lg font-medium text-gray-900">
                Confirmar Reembolso
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="text-gray-400 hover:text-gray-500 focus:outline-none disabled:opacity-50"
                  disabled={isProcessingRefund}
                  aria-label="Fechar"
                >
                  <FaTimes className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="mt-2">
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                <div className="flex">
                  <div className="shrink-0">
                    <IoIosWarning className="h-5 w-5 text-yellow-400" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-700">
                      <span className="font-bold">Atenção:</span> Ao confirmar o reembolso, você perderá o acesso a este curso imediatamente.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Para confirmar, digite <span className="font-medium">"quero reembolsar"</span> no campo abaixo:
              </p>

              <div className="mb-4">
                <input
                  type="text"
                  value={refundConfirmationText}
                  onChange={(e) => {
                    setRefundConfirmationText(e.target.value);
                    if (refundError) setRefundError('');
                  }}
                  className={`mt-1 block w-full rounded-md ${refundError ? 'border-red-300' : 'border-gray-300'} shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2`}
                  placeholder="Digite aqui..."
                  disabled={isProcessingRefund} />
                {refundError && (
                  <p className="mt-1 text-sm text-red-600">{refundError}</p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  disabled={isProcessingRefund}
                >
                  Cancelar
                </button>
              </Dialog.Close>
              <button
                type="button"
                className={`inline-flex justify-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white ${isProcessingRefund || refundConfirmationText.toLowerCase() !== 'quero reembolsar'
                  ? 'bg-blue-400'
                  : 'bg-blue-600 hover:bg-blue-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50`}
                onClick={handleRefund}
                disabled={isProcessingRefund || refundConfirmationText.toLowerCase() !== 'quero reembolsar'}
              >
                {isProcessingRefund ? 'Processando...' : 'Confirmar Reembolso'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    </div>
  );
}