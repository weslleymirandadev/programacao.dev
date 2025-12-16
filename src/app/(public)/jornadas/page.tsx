"use client";

import Link from "next/link";
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
  courses: { id: string }[];
};

export default function JornadasPage() {
  const { data: session } = useSession();
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const [accessMap, setAccessMap] = useState<Record<string, { hasAccess: boolean }>>({});

  useEffect(() => {
    async function checkAccess() {
      if (session?.user?.id) {
        const newAccessMap: Record<string, { hasAccess: boolean }> = {};

        await Promise.all(journeys.map(async (journey) => {
          const itemKey = `journey-${journey.id}`;
          try {
            const response = await fetch(`/api/user/has-access?type=journey&id=${journey.id}`);
            const { hasAccess } = await response.json();
            newAccessMap[itemKey] = { hasAccess };
          } catch (error) {
            console.error("Error checking access for journey:", journey.id, error);
            newAccessMap[itemKey] = { hasAccess: false };
          }
        }));

        setAccessMap(prev => ({ ...prev, ...newAccessMap }));
      }
    }

    if (journeys.length > 0) {
      checkAccess();
    }
  }, [session, journeys]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const journeysRes = await fetch('/api/journeys?public=true');
        if (!journeysRes.ok) throw new Error('Failed to fetch journeys');
        const journeysData = await journeysRes.json();
        setJourneys(journeysData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Erro ao carregar as jornadas');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAddToCart = (item: { id: string; title: string; price: number | null; type: 'jornada' }) => {
    if (!item.price) {
      toast.error('Esta jornada não pode ser adicionada ao carrinho');
      return;
    }

    addItem({
      id: item.id,
      title: item.title,
      price: item.price,
      type: item.type,
    });
    toast.success('Jornada adicionada ao carrinho');
  };

  const renderAccessButton = (journey: Journey) => {
    const itemId = `journey-${journey.id}`;
    const hasAccess = accessMap[itemId]?.hasAccess || false;

    if (session && hasAccess) {
      return (
        <Link
          href={`/dashboard/jornadas/${journey.id}`}
          className="w-full text-center bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition-colors"
        >
          Acessar Jornada
        </Link>
      );
    }

    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          handleAddToCart({
            id: journey.id,
            title: journey.title,
            price: journey.price || 0,
            type: 'jornada'
          });
        }}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors"
        disabled={loading}
      >
        Adicionar ao Carrinho
      </button>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <section>
        <h1 className="text-4xl font-bold mb-6">Jornadas de Aprendizado</h1>
        {journeys.length === 0 ? (
          <p className="text-gray-600">Nenhuma jornada disponível no momento.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {journeys.map((journey) => (
              <div key={journey.id} className="border rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow">
                {journey.imageUrl && (
                  <Link href={`/jornadas/${journey.id}`}>
                    <img
                      src={journey.imageUrl}
                      alt={journey.title}
                      className="w-full h-48 object-cover"
                    />
                  </Link>
                )}
                <div className="p-4">
                  <Link href={`/jornadas/${journey.id}`}>
                    <h2 className="text-xl font-semibold mb-2">{journey.title}</h2>
                  </Link>
                  <p className="text-gray-600 mb-3 line-clamp-2 h-12">{journey.description}</p>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm text-gray-500">
                      {journey.courses.length} {journey.courses.length === 1 ? 'curso' : 'cursos'} incluídos
                    </span>
                    <span className="font-bold">{formatPrice(journey.price!)}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/jornadas/${journey.id}`}
                      className="text-center bg-primary text-white py-2 rounded hover:bg-primary/90 transition-colors"
                    >
                      Ver Jornada
                    </Link>
                    <div className="mt-4">
                      {renderAccessButton(journey)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

