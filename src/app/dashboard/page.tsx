// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FaBook, FaBookOpen, FaGraduationCap, FaMapSigns, FaRegClock, FaSearch } from 'react-icons/fa';
import { motion } from 'framer-motion';

interface Course {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  level: string;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      duration: number;
    }>;
  }>;
}

interface Journey {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  level: string;
  courses: Array<{
    order: number;
    course: Course;
  }>;
}

interface DashboardData {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
  courses: Course[];
  journeys: Journey[];
}

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('/api/dashboard');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        const data = await response.json();
        setData(data);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        // Redirect to home if not authenticated
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const filteredCourses = data?.courses.filter(course => 
    course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    course.description.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredJourneys = data?.journeys.filter(journey => 
    journey.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    journey.description.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-gray-900">Erro ao carregar o dashboard</h2>
          <p className="mt-2 text-gray-600">Por favor, tente novamente mais tarde.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Meu Aprendizado</h1>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FaSearch className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar cursos e jornadas..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Courses Section */}
        <section className="mb-12">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <FaBook className="mr-2 text-blue-600" />
              Meus Cursos
            </h2>
            <span className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
              {filteredCourses.length} curso{filteredCourses.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filteredCourses.length > 0 ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCourses.map((course) => (
                <motion.div
                  key={course.id}
                  whileHover={{ y: -5 }}
                  className="bg-white overflow-hidden shadow rounded-lg"
                >
                  <Link href={`/courses/${course.id}`}>
                    <div className="h-48 bg-gray-200 overflow-hidden">
                      {course.imageUrl ? (
                        <img
                          className="w-full h-full object-cover"
                          src={course.imageUrl}
                          alt={course.title}
                        />
                      ) : (
                        <div className="w-full h-full bg-linear-to-r from-blue-500 to-blue-700 flex items-center justify-center">
                          <FaGraduationCap className="h-16 w-16 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="p-6">
                      <div className="flex items-center mb-2">
                        <span className="px-2 py-1 text-xs font-semibold text-blue-800 bg-blue-100 rounded-full">
                          {course.level}
                        </span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                        {course.title}
                      </h3>
                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                        {course.description}
                      </p>
                      <div className="flex items-center text-sm text-gray-500">
                        <FaBookOpen className="mr-1" />
                        <span className="mr-4">
                          {course.modules.length} módulo{course.modules.length !== 1 ? 's' : ''}
                        </span>
                        <FaRegClock className="mr-1" />
                        <span>
                          {Math.ceil(
                            course.modules.reduce(
                              (total, module) =>
                                total + module.lessons.reduce((sum, lesson) => sum + (lesson.duration || 0), 0),
                              0
                            ) / 60
                          )}{' '}
                          min
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <FaBookOpen className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium text-gray-900">
                Nenhum curso encontrado
              </h3>
              <p className="mt-1 text-gray-500">
                {searchTerm
                  ? 'Nenhum curso corresponde à sua busca.'
                  : 'Você ainda não está inscrito em nenhum curso.'}
              </p>
              {searchTerm ? (
                <button
                  onClick={() => setSearchTerm('')}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-500"
                >
                  Limpar busca
                </button>
              ) : (
                <Link
                  href="/courses"
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                >
                  Explorar cursos
                </Link>
              )}
            </div>
          )}
        </section>

        {/* Journeys Section */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <FaMapSigns className="mr-2 text-green-600" />
              Minhas Jornadas
            </h2>
            <span className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded-full">
              {filteredJourneys.length} jornada{filteredJourneys.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filteredJourneys.length > 0 ? (
            <div className="grid grid-cols-1 gap-6">
              {filteredJourneys.map((journey) => {
                const totalCourses = journey.courses.length;
                const totalLessons = journey.courses.reduce(
                  (total, { course }) =>
                    total +
                    course.modules.reduce(
                      (sum, module) => sum + module.lessons.length,
                      0
                    ),
                  0
                );
                const totalDuration = Math.ceil(
                  journey.courses.reduce(
                    (total, { course }) =>
                      total +
                      course.modules.reduce(
                        (sum, module) =>
                          sum +
                          module.lessons.reduce(
                            (lessonSum, lesson) =>
                              lessonSum + (lesson.duration || 0),
                            0
                          ),
                        0
                      ),
                    0
                  ) / 60
                );

                return (
                  <motion.div
                    key={journey.id}
                    whileHover={{ x: 5 }}
                    className="bg-white overflow-hidden shadow rounded-lg"
                  >
                    <Link href={`/journeys/${journey.id}`}>
                      <div className="p-6">
                        <div className="flex items-start">
                          <div className="shrink-0 h-24 w-24 bg-green-100 rounded-md flex items-center justify-center">
                            {journey.imageUrl ? (
                              <img
                                className="h-full w-full object-cover rounded-md"
                                src={journey.imageUrl}
                                alt={journey.title}
                              />
                            ) : (
                              <FaMapSigns className="h-12 w-12 text-green-600" />
                            )}
                          </div>
                          <div className="ml-6 flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="text-xl font-semibold text-gray-900">
                                {journey.title}
                              </h3>
                              <span className="px-2 py-1 text-xs font-semibold text-green-800 bg-green-100 rounded-full">
                                {journey.level}
                              </span>
                            </div>
                            <p className="mt-2 text-gray-600">
                              {journey.description}
                            </p>
                            <div className="mt-4 flex space-x-6">
                              <div className="flex items-center text-sm text-gray-500">
                                <FaBook className="mr-1" />
                                <span>
                                  {totalCourses} curso
                                  {totalCourses !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center text-sm text-gray-500">
                                <FaBookOpen className="mr-1" />
                                <span>
                                  {totalLessons} aula
                                  {totalLessons !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center text-sm text-gray-500">
                                <FaRegClock className="mr-1" />
                                <span>{totalDuration} min</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg shadow">
              <FaMapSigns className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium text-gray-900">
                Nenhuma jornada encontrada
              </h3>
              <p className="mt-1 text-gray-500">
                {searchTerm
                  ? 'Nenhuma jornada corresponde à sua busca.'
                  : 'Você ainda não está inscrito em nenhuma jornada.'}
              </p>
              {searchTerm ? (
                <button
                  onClick={() => setSearchTerm('')}
                  className="mt-4 text-sm text-green-600 hover:text-green-500"
                >
                  Limpar busca
                </button>
              ) : (
                <Link
                  href="/journeys"
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700"
                >
                  Explorar jornadas
                </Link>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}