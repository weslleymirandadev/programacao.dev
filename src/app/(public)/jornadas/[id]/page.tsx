"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCart } from "@/context/CartContext";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { formatPrice } from "@/lib/price";

type Journey = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  price: number | null;
  public: boolean;
  courses: {
    id: string;
    course: {
      id: string;
      title: string;
      description: string;
      imageUrl: string | null;
    };
  }[];
};

export default function JornadaDetailPage() {
  const params = useParams();
  const router = useRouter();
  const journeyId = params.id as string;
  const { data: session } = useSession();
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const { addItem } = useCart();

  useEffect(() => {
    const fetchJourney = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/journeys/${journeyId}`);
        if (!response.ok) {
          if (response.status === 404) {
            toast.error('Jornada não encontrada');
            router.push('/jornadas');
            return;
          }
          throw new Error('Falha ao carregar jornada');
        }
        const data = await response.json();
        setJourney(data);
      } catch (error) {
        console.error('Error fetching journey:', error);
        toast.error('Erro ao carregar jornada');
        router.push('/jornadas');
      } finally {
        setLoading(false);
      }
    };

    if (journeyId) {
      fetchJourney();
    }
  }, [journeyId, router]);

  useEffect(() => {
    const checkAccess = async () => {
      if (session?.user?.id && journey) {
        try {
          const response = await fetch(`/api/user/has-access?type=journey&id=${journey.id}`);
          const { hasAccess: access } = await response.json();
          setHasAccess(access);
        } catch (error) {
          console.error("Error checking access:", error);
          setHasAccess(false);
        }
      }
    };

    if (journey) {
      checkAccess();
    }
  }, [session, journey]);

  const handleAddToCart = () => {
    if (!journey || !journey.price) {
      toast.error('Esta jornada não pode ser adicionada ao carrinho');
      return;
    }

    addItem({
      id: journey.id,
      title: journey.title,
      price: journey.price,
      type: 'jornada',
    });
    toast.success('Jornada adicionada ao carrinho');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!journey) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Jornada não encontrada</h1>
          <Link href="/jornadas" className="text-primary hover:underline">
            Voltar para Jornadas
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <Link href="/jornadas" className="text-primary hover:underline">
          ← Voltar para Jornadas
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          {journey.imageUrl && (
            <img
              src={journey.imageUrl}
              alt={journey.title}
              className="w-full h-96 object-cover rounded-lg mb-4"
            />
          )}
        </div>

        <div>
          <h1 className="text-4xl font-bold mb-4">{journey.title}</h1>
          <p className="text-gray-600 mb-6 text-lg">{journey.description}</p>
          
          <div className="mb-6">
            <span className="text-3xl font-bold">{formatPrice(journey.price!)}</span>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">
              Cursos Incluídos ({journey.courses?.length || 0})
            </h2>
            {journey.courses && journey.courses.length > 0 ? (
              <ul className="space-y-2">
                {journey.courses.map((journeyCourse) => (
                  <li key={journeyCourse.course.id} className="flex items-center gap-2">
                    <span className="text-primary">•</span>
                    <span>{journeyCourse.course.title}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500">Nenhum curso incluído nesta jornada.</p>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {session && hasAccess ? (
              <Link
                href={`/dashboard/jornadas/${journey.id}`}
                className="w-full text-center bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg transition-colors font-semibold"
              >
                Acessar Jornada
              </Link>
            ) : (
              <button
                onClick={handleAddToCart}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg transition-colors font-semibold"
                disabled={loading}
              >
                Adicionar ao Carrinho
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

