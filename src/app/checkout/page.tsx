"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { useCart } from "@/context/CartContext";
import { CheckoutPaymentForm } from "../../components/CheckoutPaymentForm";
import { formatPrice } from "@/lib/price";

export default function CheckoutCartPage() {
  const { items, total, removeItem, clearCart } = useCart();
  const { status } = useSession();
  const [authRedirecting, setAuthRedirecting] = useState(false);

  // Se houver itens no carrinho mas o usuário não estiver autenticado,
  // dispara o fluxo de login com callback para /checkout
  useEffect(() => {
    if (status === "unauthenticated" && items.length > 0 && !authRedirecting) {
      setAuthRedirecting(true);
      void signIn(undefined, { callbackUrl: "/checkout" });
    }
  }, [status, items.length, authRedirecting]);

  if (status === "loading" || authRedirecting) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Redirecionando para login</h1>
          <p className="text-sm text-gray-500">
            Aguarde, estamos preparando seu checkout.
          </p>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10">
        <div className="mx-auto max-w-lg space-y-4 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Carrinho vazio</h1>
          <p className="text-sm text-gray-500">
            Adicione cursos ou jornadas na página inicial para continuar.
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Ver cursos e jornadas
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-8 rounded-lg bg-white p-6 shadow">
        <header className="space-y-1 border-b border-gray-200 pb-4">
          <p className="text-xs uppercase tracking-wide text-gray-400">Checkout</p>
          <h1 className="text-2xl font-semibold text-gray-900">Revisar carrinho</h1>
        </header>

        <section className="space-y-4">
          <ul className="space-y-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-md border border-gray-200 p-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="text-xs uppercase text-gray-400">
                    {item.type === "jornada" ? "Jornada" : "Curso"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatPrice(item.price)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id, item.type)}
                    className="text-xs font-medium text-red-500 hover:text-red-600"
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between rounded-md bg-gray-50 p-4">
            <span className="text-sm font-medium text-gray-700">Total</span>
            <span className="text-lg font-semibold text-gray-900">
              {formatPrice(total)}
            </span>
          </div>
        </section>

        <footer className="flex flex-col gap-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Continuar escolhendo
            </Link>

            <button
              type="button"
              onClick={clearCart}
              className="inline-flex items-center justify-center rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50"
            >
              Limpar carrinho
            </button>
          </div>

          <CheckoutPaymentForm 
            amount={total} 
            items={items.map(item => ({
              id: item.id,
              type: item.type as 'course' | 'journey',
              title: item.title,
              price: item.price
            }))} 
          />
        </footer>
      </div>
    </main>
  );
}
