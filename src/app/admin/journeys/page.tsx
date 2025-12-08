// src/app/admin/journeys/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FaPlus, FaSearch, FaEdit, FaTrash, FaSpinner } from 'react-icons/fa';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { formatPrice } from '@/lib/price';

interface Journey {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  price: number | null;
  public: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function JourneysPage() {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredJourneys, setFilteredJourneys] = useState<Journey[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetchJourneys();
  }, []);

  const fetchJourneys = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/journeys');
      const data = await response.json();
      if (response.ok) {
        setJourneys(data);
        setFilteredJourneys(data);
      } else {
        throw new Error(data.error || 'Falha ao carregar jornadas');
      }
    } catch (error) {
      console.error('Error fetching journeys:', error);
      toast.error('Erro ao carregar jornadas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredJourneys(journeys);
    } else {
      const filtered = journeys.filter(
        (journey) =>
          journey.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          journey.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredJourneys(filtered);
    }
  }, [searchTerm, journeys]);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta jornada?')) return;

    try {
      const response = await fetch(`/api/journeys/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('Jornada excluída com sucesso');
        fetchJourneys();
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Falha ao excluir jornada');
      }
    } catch (error) {
      console.error('Error deleting journey:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir jornada');
    }
  };

  const toggleJourneyStatus = async (journey: Journey) => {
    try {
      const response = await fetch(`/api/journeys/${journey.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...journey,
          public: !journey.public,
        }),
      });

      if (response.ok) {
        toast.success('Status da jornada atualizado com sucesso');
        fetchJourneys();
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Falha ao atualizar status da jornada');
      }
    } catch (error) {
      console.error('Error updating journey status:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar status da jornada');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <FaSpinner className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between space-y-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold">Jornadas</h1>
        </div>
        <Button asChild>
          <Link href="/admin/journeys/new" className="flex items-center gap-2">
            <FaPlus className="h-4 w-4" />
            Nova Jornada
          </Link>
        </Button>
      </div>

      <div className="space-y-6">
        <div className="relative">
          <FaSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Pesquisar jornadas..."
            className="w-full rounded-lg bg-background pl-8 md:w-[200px] lg:w-[336px]"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jornada</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data de Criação</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJourneys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    Nenhuma jornada encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filteredJourneys.map((journey) => (
                  <TableRow key={journey.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-4">
                        {journey.imageUrl && (
                          <img
                            src={journey.imageUrl}
                            alt={journey.title}
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        )}
                        <div>
                          <div className="font-medium">{journey.title}</div>
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {journey.description}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">
                        {formatPrice(journey.price!)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`status-${journey.id}`}
                          checked={journey.public}
                          onCheckedChange={() => toggleJourneyStatus(journey)}
                        />
                        <Label htmlFor={`status-${journey.id}`}>
                          {journey.public ? 'Público' : 'Privado'}
                        </Label>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(journey.createdAt).toLocaleDateString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`/admin/journeys/${journey.id}`}>
                            <FaEdit className="h-4 w-4" />
                            <span className="sr-only">Editar</span>
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(journey.id)}
                        >
                          <FaTrash className="h-4 w-4 text-destructive" />
                          <span className="sr-only">Excluir</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}