"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { formatPrice } from "@/lib/price";
import { useRouter } from "next/navigation";

type Course = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  price: number | null;
  discountPrice: number;
  discountEnabled: boolean;
  level: string;
  public: boolean;
};

type Journey = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  price: number | null;
  public: boolean;
  courses: { id: string }[];
};

export default function Home() {
  const { data: session, status } = useSession();
  const [courses, setCourses] = useState<Course[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();
  const router = useRouter();
  const [accessMap, setAccessMap] = useState<Record<string, { hasAccess: boolean }>>({});

  useEffect(() => {
    async function checkAccess() {
      if (session?.user?.id) {
        const newAccessMap: Record<string, { hasAccess: boolean }> = {};

        // Check access for each course
        await Promise.all(courses.map(async (course) => {
          const itemKey = `course-${course.id}`;
          try {
            const response = await fetch(`/api/user/has-access?type=course&id=${course.id}`);
            const { hasAccess } = await response.json();
            newAccessMap[itemKey] = { hasAccess };
          } catch (error) {
            console.error("Error checking access for course:", course.id, error);
            newAccessMap[itemKey] = { hasAccess: false };
          }
        }));

        // Check access for each journey
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

    if (courses.length > 0 || journeys.length > 0) {
      checkAccess();
    }
  }, [session, courses, journeys]);


  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch public courses
        const coursesRes = await fetch('/api/courses?public=true');
        if (!coursesRes.ok) throw new Error('Failed to fetch courses');
        const coursesData = await coursesRes.json();

        // Fetch public journeys with their courses
        const journeysRes = await fetch('/api/journeys?public=true');
        if (!journeysRes.ok) throw new Error('Failed to fetch journeys');
        const journeysData = await journeysRes.json();

        setCourses(coursesData);
        setJourneys(journeysData);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Erro ao carregar os dados');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAddToCart = (item: { id: string; title: string; price: number | null; type: 'curso' | 'jornada' }) => {
    if (!item.price) {
      toast.error('Este item não pode ser adicionado ao carrinho');
      return;
    }

    // Price is already in cents from the database
    addItem({
      id: item.id,
      title: item.title,
      price: item.price, // Store in cents
      type: item.type,
    });
    toast.success(`${item.type === 'curso' ? 'Curso' : 'Jornada'} adicionado ao carrinho`);
  };

  const renderAccessButton = (item: Course | Journey, type: 'curso' | 'jornada') => {
    const itemId = `${type === 'curso' ? 'course' : 'journey'}-${item.id}`;
    const hasAccess = accessMap[itemId]?.hasAccess || false;

    if (session && hasAccess) {
      return (
        <Link
          href={`/dashboard/${type}s/${item.id}`}
          className="w-full text-center bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition-colors"
        >
          Acessar {type === 'curso' ? 'Curso' : 'Jornada'}
        </Link>
      );
    }

    return (
      <button
        onClick={(e) => {
          e.preventDefault();
          handleAddToCart(
            {
              id: item.id,
              title: item.title,
              price: type === 'curso'
                ? (item as Course).discountPrice || (item as Course).price || 0
                : (item as Journey).price || 0,
              type: type
            }
          );
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
      <section className="mb-16">
        <h1 className="text-4xl font-bold mb-6">Cursos Disponíveis</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (

            <div key={course.id} className="border rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow">
              {course.imageUrl && (
                <Link
                  href={`/cursos/${course.id}`}
                >
                  <img
                    src={course.imageUrl}
                    alt={course.title}
                    className="w-full h-48 object-cover"
                  />
                </Link>
              )}
              <div className="p-4">
                <Link
                  href={`/cursos/${course.id}`}
                >
                  <h2 className="text-xl font-semibold mb-2">{course.title}</h2>
                </Link>
                <p className="text-gray-600 mb-3 line-clamp-2 h-12">{course.description}</p>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm text-gray-500">{course.level}</span>
                  <div className="text-right">
                    {course.discountEnabled && course.discountPrice > 0 ? (
                      <div className="flex flex-col items-end">
                        <span className="text-xs line-through text-gray-400">
                          {formatPrice(course.price!)}
                        </span>
                        <span className="font-bold text-red-600">
                          {formatPrice(course.discountPrice)}
                        </span>
                      </div>
                    ) : (
                      <span className="font-bold">{formatPrice(course.price!)}</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-2">

                  <div className="mt-4">
                    {renderAccessButton(course, "curso")}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h1 className="text-4xl font-bold mb-6">Jornadas de Aprendizado</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {journeys.map((journey) => (
            <div key={journey.id} className="border rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow">
              {journey.imageUrl && (
                <img
                  src={journey.imageUrl}
                  alt={journey.title}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-2">{journey.title}</h2>
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
                    {renderAccessButton(journey, "jornada")}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {status === "authenticated" && (
        <button onClick={() => signOut()}>Log out</button>
      )}
    </main>
  );
}