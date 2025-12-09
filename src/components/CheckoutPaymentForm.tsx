"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { FaCreditCard } from "react-icons/fa";
import { FaPix } from "react-icons/fa6";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { formatPrice } from "@/lib/price";

function isValidCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calcCheckDigit = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += parseInt(base.charAt(i), 10) * (factor - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const baseNine = digits.substring(0, 9);
  const d1 = calcCheckDigit(baseNine, 10);
  const d2 = calcCheckDigit(baseNine + d1.toString(), 11);

  return digits === baseNine + d1.toString() + d2.toString();
}

// Centralized validation rules
const VALIDATION_RULES = {
  cardNumber: {
    min: 19, // 16 digits + 3 spaces (#### #### #### ####)
    max: 19,
    error: {
      min: "Número do cartão deve ter 16 dígitos",
      max: "Número do cartão deve ter no máximo 16 dígitos",
      invalid: "Número do cartão inválido"
    }
  },
  expiry: {
    min: 5, // MM/AA
    max: 5,
    error: "Data de validade inválida (MM/AA)"
  },
  cvv: {
    min: 3,
    max: 3,
    error: "CVV deve ter 3 dígitos"
  },
  cpf: {
    min: 14, // 11 digits + formatting (###.###.###-##)
    max: 14,
    error: {
      min: "CPF deve ter 11 dígitos",
      invalid: "CPF inválido"
    }
  },
  cnpj: {
    min: 18, // 14 digits + formatting (##.###.###/####-##)
    max: 18,
    error: {
      min: "CNPJ deve ter 14 dígitos",
      invalid: "CNPJ inválido"
    }
  }
};

// Helper function to validate expiry date
const isValidExpiry = (expiry: string): boolean => {
  const [monthStr, yearStr] = expiry.split('/');
  if (!monthStr || !yearStr) return false;
  
  const month = parseInt(monthStr, 10);
  const year = 2000 + parseInt(yearStr, 10);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  if (month < 1 || month > 12) return false;
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  return true;
};

const cardSchema = z.object({
  holderName: z.string().min(1, "Informe o nome do titular"),
  email: z.string().email("E-mail inválido"),
  cardNumber: z.string()
    .min(VALIDATION_RULES.cardNumber.min, VALIDATION_RULES.cardNumber.error.min)
    .max(VALIDATION_RULES.cardNumber.max, VALIDATION_RULES.cardNumber.error.max)
    .refine(val => /^\d{4} \d{4} \d{4} \d{4}$/.test(val), 
      VALIDATION_RULES.cardNumber.error.invalid),
  expiry: z.string()
    .length(VALIDATION_RULES.expiry.min, VALIDATION_RULES.expiry.error)
    .refine(val => /^\d{2}\/\d{2}$/.test(val) && isValidExpiry(val), 
      "Data de validade inválida ou expirada"),
  cvv: z.string()
    .min(VALIDATION_RULES.cvv.min, VALIDATION_RULES.cvv.error)
    .max(VALIDATION_RULES.cvv.max, VALIDATION_RULES.cvv.error)
    .refine(val => /^\d{3,4}$/.test(val), "CVV inválido"),
  documentType: z.enum(["CPF", "CNPJ"]),
  document: z.string().superRefine((val, ctx) => {
    // @ts-ignore - parent exists at runtime but not in type definition
    const documentType = ctx.parent?.documentType;
    
    if (documentType === "CPF") {
      if (val.length < VALIDATION_RULES.cpf.min) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          minimum: VALIDATION_RULES.cpf.min,
          type: "string",
          inclusive: true,
          message: VALIDATION_RULES.cpf.error.min,
          origin: "string"
        });
      } else if (!isValidCpf(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: VALIDATION_RULES.cpf.error.invalid
        });
      }
    } else { // CNPJ
      if (val.length < VALIDATION_RULES.cnpj.min) {
        ctx.addIssue({
          code: z.ZodIssueCode.too_small,
          minimum: VALIDATION_RULES.cnpj.min,
          type: "string",
          inclusive: true,
          message: VALIDATION_RULES.cnpj.error.min,
          origin: "string"
        });
      }
      // Add CNPJ validation if needed
    }
  }),
  installments: z.number().min(1, "Selecione o número de parcelas")
});

const pixSchema = z.object({
  cpf: z.string()
    .min(VALIDATION_RULES.cpf.min, VALIDATION_RULES.cpf.error.min)
    .refine(val => isValidCpf(val), VALIDATION_RULES.cpf.error.invalid)
});

export interface CartItem {
  id: string;
  type: 'course' | 'journey';
  title: string;
  price: number;
}

interface UserSession {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface SessionData {
  user?: UserSession;
  status: 'authenticated' | 'unauthenticated' | 'loading';
}

interface CheckoutPaymentFormProps {
  amount: number;
  items: CartItem[];
}

export function CheckoutPaymentForm({ amount, items }: CheckoutPaymentFormProps) {
  const { data: session } = useSession() as { data: SessionData | null };
  const router = useRouter();
  const [method, setMethod] = useState<"card" | "pix" | null>(null);
  const [processing, setProcessing] = useState(false);
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
  } = useForm<z.infer<typeof cardSchema>>({
    resolver: zodResolver(cardSchema),
    mode: "onChange",
    defaultValues: { 
      documentType: "CPF",
      email: session?.user?.email || "",
      holderName: session?.user?.name || "",
    },
  });
  
  const documentType = watch("documentType");
  const installments = watch("installments");
  
  const pixForm = useForm<z.infer<typeof pixSchema>>({
    resolver: zodResolver(pixSchema),
    mode: "onChange",
  });
  
  const { register: registerPix, handleSubmit: handleSubmitPix, formState: { errors: pixErrors } } = pixForm;

  function maskCpf(value: string) {
    let v = value.replace(/\D/g, "");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    return v;
  }

  function maskCnpj(value: string) {
    let v = value.replace(/\D/g, "");
    v = v.replace(/(\d{2})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1.$2");
    v = v.replace(/(\d{3})(\d)/, "$1/$2");
    v = v.replace(/(\d{4})(\d{1,2})$/, "$1-$2");
    return v;
  }

  function maskCardNumber(value: string) {
    const v = value.replace(/\D/g, "");
    const groups = v.match(/\d{1,4}/g);
    return groups ? groups.join(" ") : "";
  }

  function maskExpiry(value: string) {
    let v = value.replace(/\D/g, "");
    v = v.replace(/(\d{2})(\d{1,2})$/, "$1/$2");
    return v;
  }

  // Format and validate card number
  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  };

  // Format and validate expiry date
  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length > 2) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  };

  // Format and validate CVV
  const formatCVV = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 4);
  };

  function getInstallmentFactor(qty: number) {
    if (qty <= 1) return 1;
    const step = 0.02; // 2% adicional por parcela acima de 1x
    return 1 + (qty - 1) * step;
  }

  function getInstallmentTotal(amount: number, qty: number) {
    return amount * getInstallmentFactor(qty);
  }

  function getInstallmentPerPayment(amount: number, qty: number) {
    if (qty <= 0) return amount;
    return getInstallmentTotal(amount, qty) / qty;
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  }

  async function onSubmitCard(data: z.infer<typeof cardSchema>) {
    if (!session?.user?.id) {
      toast.error("Você precisa estar logado para finalizar a compra");
      return;
    }

    setProcessing(true);
    try {
      // Parse da data de validade (MM/AA)
      const [expiryMonth, expiryYear] = data.expiry.split('/');
      const expiryYearFull = `20${expiryYear}`;

      // Gerar token do cartão
      const tokenResponse = await fetch("/api/mercado-pago/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cardNumber: data.cardNumber.replace(/\s/g, ''),
          cardholderName: data.holderName,
          cardExpirationMonth: expiryMonth,
          cardExpirationYear: expiryYearFull,
          securityCode: data.cvv,
          identificationType: data.documentType,
          identificationNumber: data.document.replace(/\D/g, ''),
        }),
      });

      if (!tokenResponse.ok) {
        const tokenError = await tokenResponse.json();
        throw new Error(tokenError.error || "Erro ao gerar token do cartão");
      }

      const { token } = await tokenResponse.json();

      // Determinar o método de pagamento baseado no número do cartão
      // Primeiro dígito: 4 = Visa, 5 = Mastercard (ambos credit_card)
      // Para simplificar, vamos usar credit_card por padrão
      const cardNumber = data.cardNumber.replace(/\s/g, '');
      const paymentMethod = cardNumber.startsWith('4') || cardNumber.startsWith('5') 
        ? 'credit_card' 
        : 'credit_card';

      // Preparar dados do pagador
      const payerName = session.user.name || data.holderName;
      const payerEmail = session.user.email || data.email;

      if (!payerEmail) {
        throw new Error("E-mail é obrigatório para o pagamento");
      }

      // Fazer o pagamento
      const paymentResponse = await fetch("/api/mercado-pago/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: paymentMethod,
          installments: data.installments,
          token: token,
          payer: {
            email: payerEmail,
            firstName: payerName.split(' ')[0] || '',
            lastName: payerName.split(' ').slice(1).join(' ') || '',
            cpf: data.document.replace(/\D/g, ''),
          },
          userId: session.user.id,
          items: items.map(item => ({
            id: item.id,
            type: item.type,
            title: item.title,
            price: item.price, // já está em centavos
            quantity: 1,
          })),
          total: amount, // já está em centavos
        }),
      });

      const paymentResult = await paymentResponse.json();

      if (!paymentResponse.ok) {
        throw new Error(paymentResult.error || "Erro ao processar pagamento");
      }

      // Verificar status do pagamento
      if (paymentResult.status === 'approved') {
        toast.success("Pagamento aprovado com sucesso!");
        router.push(`/checkout/success?payment_id=${paymentResult.id}`);
      } else if (paymentResult.status === 'pending') {
        toast.success("Pagamento pendente. Aguardando confirmação.");
        router.push(`/checkout/success?payment_id=${paymentResult.id}`);
      } else {
        throw new Error(paymentResult.status_detail || "Pagamento não foi aprovado");
      }
    } catch (error: any) {
      console.error('Erro no pagamento:', error);
      toast.error(error.message || "Ocorreu um erro ao processar seu pagamento. Por favor, tente novamente.");
    } finally {
      setProcessing(false);
    }
  }

  async function onSubmitPix(data: z.infer<typeof pixSchema>) {
    if (!session?.user?.id) {
      toast.error("Você precisa estar logado para finalizar a compra");
      return;
    }

    setProcessing(true);
    try {
      // Preparar dados do pagador
      const payerName = session.user.name || '';
      const payerEmail = session.user.email;

      if (!payerEmail) {
        throw new Error("E-mail é obrigatório para o pagamento");
      }

      // Fazer o pagamento PIX
      const paymentResponse = await fetch("/api/mercado-pago/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          method: 'pix',
          installments: 1,
          payer: {
            email: payerEmail,
            firstName: payerName.split(' ')[0] || '',
            lastName: payerName.split(' ').slice(1).join(' ') || '',
            cpf: data.cpf.replace(/\D/g, ''),
          },
          userId: session.user.id,
          items: items.map(item => ({
            id: item.id,
            type: item.type,
            title: item.title,
            price: item.price, // já está em centavos
            quantity: 1,
          })),
          total: amount, // já está em centavos
        }),
      });

      const paymentResult = await paymentResponse.json();

      if (!paymentResponse.ok) {
        throw new Error(paymentResult.error || "Erro ao processar pagamento");
      }

      // Verificar se há QR Code do PIX
      if (paymentResult.point_of_interaction?.transaction_data) {
        const pixData = paymentResult.point_of_interaction.transaction_data;
        
        // Redirecionar para página de sucesso com dados do PIX
        const params = new URLSearchParams({
          payment_id: paymentResult.id?.toString() || '',
          pix: 'true',
          qr_code: pixData.qr_code || '',
          qr_code_base64: pixData.qr_code_base64 || '',
          ticket_url: pixData.ticket_url || '',
        });
        
        router.push(`/checkout/success?${params.toString()}`);
      } else {
        toast.success("PIX gerado com sucesso!");
        router.push(`/checkout/success?payment_id=${paymentResult.id}&pix=true`);
      }
    } catch (error: any) {
      console.error('Erro no pagamento PIX:', error);
      toast.error(error.message || "Ocorreu um erro ao processar seu pagamento. Por favor, tente novamente.");
    } finally {
      setProcessing(false);
    }
  }

  if (!amount) {
    return null;
  }

  return (
    <section className="space-y-4 pt-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-gray-900">Método de pagamento</h2>
        <p className="text-xs text-gray-500">Escolha um método para concluir sua compra.</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMethod("card")}
            className={`flex items-center rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition hover:scale-105 ${method === "card"
                ? "border-green-600 bg-green-50 text-green-700"
                : "border-gray-200 bg-white text-gray-700"
              }`}
          >
            <FaCreditCard className="mr-2" /> Cartão
          </button>
          <button
            type="button"
            onClick={() => setMethod("pix")}
            className={`flex items-center rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition hover:scale-105 ${method === "pix"
                ? "border-green-600 bg-green-50 text-green-700"
                : "border-gray-200 bg-white text-gray-700"
              }`}
          >
            <FaPix className="mr-2" /> Pix
          </button>
        </div>
      </div>

      {method === "card" && (
        <form
          onSubmit={handleSubmit(onSubmitCard)}
          className="space-y-4 rounded-md border border-gray-200 p-4"
        >
          <p className="text-xs text-gray-500">
            Valor total: <span className="font-semibold">{formatPrice(amount)}</span>
          </p>

          <div className="relative w-full">
            <input
              type="text"
              maxLength={19}
              onKeyDown={handleKeyDown}
              {...register("cardNumber", {
                onChange: (e) => {
                  const masked = formatCardNumber(e.target.value);
                  e.target.value = masked;
                  trigger("cardNumber");
                },
              })}
              className={`peer h-10 w-full rounded-md border px-3 py-5 text-sm outline-none transition-colors border-gray-300 focus:border-green-600 focus:ring-1 focus:ring-green-600 ${errors.cardNumber ? "border-red-400" : ""}`}
              placeholder=" "
            />
            <label
              className={`pointer-events-none line-clamp-1 text-nowrap absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all duration-200 ease-in-out peer-placeholder-shown:top-[0.45rem] peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-[-0.7rem] peer-focus:text-xs peer-focus:text-green-700 ${errors.cardNumber ? "text-red-400" : "text-gray-300"}`}
            >
              Número do cartão
            </label>
            {errors.cardNumber && (
              <span className="text-xs text-red-500">{errors.cardNumber.message}</span>
            )}
          </div>

          <div className="flex gap-3">
            <div className="relative w-full">
              <input
                type="text"
                maxLength={5}
                onKeyDown={handleKeyDown}
                {...register("expiry", {
                  onChange: (e) => {
                    const v = formatExpiry(e.target.value);
                    e.target.value = v;
                    setValue("expiry", v, { shouldValidate: true });
                  },
                })}
                className={`peer h-10 w-full rounded-md border px-3 py-5 text-sm outline-none transition-colors border-gray-300 focus:border-green-600 focus:ring-1 focus:ring-green-600 ${errors.expiry ? "border-red-400" : ""}`}
                placeholder=" "
              />
              <label
                className={`pointer-events-none line-clamp-1 text-nowrap absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all duration-200 ease-in-out peer-placeholder-shown:top-[0.45rem] peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-[-0.7rem] peer-focus:text-xs peer-focus:text-green-700 ${errors.expiry ? "text-red-400" : "text-gray-300"}`}
              >
                Validade (MM/AA)
              </label>
              {errors.expiry && (
                <span className="text-xs text-red-500">{errors.expiry.message}</span>
              )}
            </div>

            <div className="relative w-full">
              <input
                type="text"
                maxLength={3}
                onKeyDown={handleKeyDown}
                {...register("cvv", {
                  onChange: (e) => {
                    const v = formatCVV(e.target.value);
                    e.target.value = v;
                    trigger("cvv");
                  },
                })}
                className={`peer h-10 w-full rounded-md border px-3 py-5 text-sm outline-none transition-colors border-gray-300 focus:border-green-600 focus:ring-1 focus:ring-green-600 ${errors.cvv ? "border-red-400" : ""}`}
                placeholder=" "
              />
              <label
                className={`pointer-events-none line-clamp-1 text-nowrap absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all duration-200 ease-in-out peer-placeholder-shown:top-[0.45rem] peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-[-0.7rem] peer-focus:text-xs peer-focus:text-green-700 ${errors.cvv ? "text-red-400" : "text-gray-300"}`}
              >
                CVV
              </label>
              {errors.cvv && (
                <span className="text-xs text-red-500">{errors.cvv.message}</span>
              )}
            </div>
          </div>

          <div className="relative w-full">
            <input
              type="text"
              onKeyDown={handleKeyDown}
              {...register("holderName", {
                onChange: (e) => {
                  e.target.value = e.target.value.toUpperCase();
                },
              })}
              className={`peer h-10 w-full rounded-md border px-3 py-5 text-sm outline-none transition-colors border-gray-300 focus:border-green-600 focus:ring-1 focus:ring-green-600 ${errors.holderName ? "border-red-400" : ""}`}
              placeholder=" "
            />
            <label
              className={`pointer-events-none line-clamp-1 text-nowrap absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all duration-200 ease-in-out peer-placeholder-shown:top-[0.45rem] peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-[-0.7rem] peer-focus:text-xs peer-focus:text-green-700 ${errors.holderName ? "text-red-400" : "text-gray-300"}`}
            >
              Nome do titular (como no cartão)
            </label>
            {errors.holderName && (
              <span className="text-xs text-red-500">{errors.holderName.message}</span>
            )}
          </div>

          <div className="relative w-full">
            <input
              type="email"
              onKeyDown={handleKeyDown}
              {...register("email")}
              className={`peer h-10 w-full rounded-md border px-3 py-5 text-sm outline-none transition-colors border-gray-300 focus:border-green-600 focus:ring-1 focus:ring-green-600 ${errors.email ? "border-red-400" : ""}`}
              placeholder=" "
            />
            <label
              className={`pointer-events-none line-clamp-1 text-nowrap absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all duration-200 ease-in-out peer-placeholder-shown:top-[0.45rem] peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-[-0.7rem] peer-focus:text-xs peer-focus:text-green-700 ${errors.email ? "text-red-400" : "text-gray-300"}`}
            >
              E-mail
            </label>
            {errors.email && (
              <span className="text-xs text-red-500">{errors.email.message}</span>
            )}
          </div>

          <div className="flex gap-3">
            <div className="relative w-1/3">
              <select
                onKeyDown={handleKeyDown}
                {...register("documentType", {
                  onChange: (e) => {
                    const value = e.target.value as "CPF" | "CNPJ";
                    const current = watch("document") || "";
                    if (value === "CPF") {
                      setValue("document", maskCpf(current));
                    } else {
                      setValue("document", maskCnpj(current));
                    }
                  },
                })}
                className={`peer h-10 w-full rounded-md border px-3 py-2 text-sm text-transparent outline-none transition-colors border-gray-300 focus:border-green-600 focus:ring-1 focus:ring-green-600 ${errors.documentType ? "border-red-400" : ""}`}
              >
                <option value="CPF" className="text-black">CPF</option>
                <option value="CNPJ" className="text-black">CNPJ</option>
              </select>
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-black">
                {documentType}
              </div>
              <label
                className={`pointer-events-none absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all peer-focus:text-green-700 ${errors.documentType ? "text-red-400" : "text-[#99A1AF]"}`}
              >
                Documento
              </label>
            </div>

            <div className="relative w-2/3">
              <input
                type="text"
                maxLength={documentType === "CPF" ? 14 : 18}
                onKeyDown={handleKeyDown}
                {...register("document", {
                  onChange: (e) => {
                    const value = e.target.value;
                    if (documentType === "CPF") {
                      e.target.value = maskCpf(value);
                    } else {
                      e.target.value = maskCnpj(value);
                    }
                    setValue("document", e.target.value, { shouldValidate: true });
                  },
                })}
                className={`peer h-10 w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors border-gray-300 focus:border-green-600 focus:ring-1 focus:ring-green-600 ${errors.document ? "border-red-400" : ""}`}
                placeholder=" "
              />
              <label
                className={`pointer-events-none line-clamp-1 text-nowrap absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all duration-200 ease-in-out peer-placeholder-shown:top-[0.45rem] peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-[-0.7rem] peer-focus:text-xs peer-focus:text-green-700 ${errors.document ? "text-red-400" : "text-gray-300"}`}
              >
                {documentType === "CPF" ? "CPF" : "CNPJ"}
              </label>
              {errors.document && (
                <span className="text-xs text-red-500">{errors.document.message}</span>
              )}
            </div>
          </div>

          <div className="relative w-full">
            <select
              onKeyDown={handleKeyDown}
              {...register("installments", { valueAsNumber: true })}
              className={`peer h-10 w-full rounded-md border px-3 py-5 text-sm text-transparent outline-none transition-colors border-gray-300 focus:border-green-600 focus:ring-1 focus:ring-green-600 ${errors.installments ? "border-red-400" : "" }`}
            >
              <option value="" className="text-black">
                Selecionar
              </option>
              {Array.from({ length: 5 }).map((_, index) => {
                const qty = index + 1;
                const amountInReais = amount / 100; // Converter de centavos para reais
                const perInstallment = getInstallmentPerPayment(amountInReais, qty);
                const total = getInstallmentTotal(amountInReais, qty);
                return (
                  <option key={qty} value={qty} className="text-black">
                    {`${qty}x de R$${perInstallment
                      .toFixed(2)
                      .replace(".", ",")} (total R$${total
                        .toFixed(2)
                        .replace(".", ",")})`}
                  </option>
                );
              })}
            </select>
            <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-black">
              {installments
                ? `${installments}x de R$${getInstallmentPerPayment(
                  amount / 100, // Converter de centavos para reais
                  installments,
                )
                  .toFixed(2)
                  .replace(".", ",")}`
                : "Selecionar"}
            </div>
            <label
              className={`pointer-events-none line-clamp-1 text-nowrap absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all peer-focus:text-green-700 ${errors.installments ? "text-red-400" : "text-[#99A1AF]"
                }`}
            >
              Número de parcelas
            </label>
            {errors.installments && (
              <span className="text-xs text-red-500">{errors.installments.message}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={processing}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-60"
          >
            {processing ? "Processando..." : "Pagar com cartão"}
          </button>
        </form>
      )}

      {method === "pix" && (
        <form
          onSubmit={handleSubmitPix(onSubmitPix)}
          className="space-y-4 rounded-md border border-gray-200 p-4"
        >
          <p className="text-xs text-gray-500">
            Você receberá um QR Code ou chave PIX para pagar o valor de
            {" "}
            <span className="font-semibold">{formatPrice(amount)}</span>.
          </p>

          <div className="relative w-full">
            <input
              type="text"
              maxLength={14}
              onKeyDown={handleKeyDown}
              {...registerPix("cpf", {
                onChange: (e) => {
                  const masked = maskCpf(e.target.value);
                  e.target.value = masked;
                  pixForm.trigger("cpf");
                },
              })}
              className={`peer h-10 w-full rounded-md border px-3 py-5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 ${pixErrors?.cpf ? "border-red-400" : "border-gray-300"
                }`}
              placeholder=" "
            />
            <label
              className={`pointer-events-none absolute left-3 top-[-0.7rem] bg-white p-[2px] text-xs transition-all duration-200 ease-in-out peer-placeholder-shown:top-[0.45rem] peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-focus:top-[-0.7rem] peer-focus:text-xs peer-focus:text-green-700 ${pixErrors?.cpf ? "text-red-400" : "text-gray-300"
                }`}
            >
              CPF do pagador
            </label>
            {pixErrors.cpf && (
              <span className="text-xs text-red-500">{pixErrors.cpf.message}</span>
            )}
          </div>

          <button
            type="submit"
            disabled={processing}
            className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-500 disabled:opacity-60"
          >
            {processing ? "Gerando PIX..." : "Gerar PIX"}
          </button>
        </form>
      )}
    </section>
  );
}
