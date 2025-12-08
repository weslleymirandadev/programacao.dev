'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'react-hot-toast';
import { parsePriceToCents } from '@/lib/price';

interface Journey {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  price: number | null;
  public: boolean;
}

export default function EditJourneyPage() {
  const router = useRouter();
  const params = useParams();
  const journeyId = params.journeyId as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Journey>({
    id: '',
    title: '',
    description: '',
    imageUrl: null,
    price: null,
    public: false,
  });

  useEffect(() => {
    const fetchJourney = async () => {
      try {
        const response = await fetch(`/api/journeys/${journeyId}`);
        if (!response.ok) {
          throw new Error('Falha ao carregar jornada');
        }
        const data = await response.json();
        setFormData(data);
      } catch (error) {
        console.error('Error fetching journey:', error);
        toast.error('Erro ao carregar jornada');
        router.push('/admin/journeys');
      } finally {
        setLoading(false);
      }
    };

    if (journeyId) {
      fetchJourney();
    }
  }, [journeyId, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTogglePublic = (checked: boolean) => {
    setFormData(prev => ({ ...prev, public: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch(`/api/journeys/${journeyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          // Price is already in cents in formData from the database
          price: formData.price,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao atualizar jornada');
      }

      toast.success('Jornada atualizada com sucesso!');
      router.push('/admin/journeys');
    } catch (error) {
      console.error('Error updating journey:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar jornada');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir esta jornada?')) return;

    try {
      const response = await fetch(`/api/journeys/${journeyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao excluir jornada');
      }

      toast.success('Jornada excluída com sucesso!');
      router.push('/admin/journeys');
    } catch (error) {
      console.error('Error deleting journey:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir jornada');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Editar Jornada</h1>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={saving}
        >
          Excluir Jornada
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="title">Título da Jornada</Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Ex.: Desenvolvimento Full Stack"
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Descreva o que os alunos vão aprender nesta jornada..."
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="imageUrl">URL da Imagem</Label>
              <Input
                id="imageUrl"
                name="imageUrl"
                type="url"
                value={formData.imageUrl || ''}
                onChange={handleChange}
                placeholder="https://exemplo.com/imagem.jpg"
              />
            </div>

            <div>
              <Label htmlFor="price">Preço (em reais)</Label>
              <Input
                id="price"
                name="price"
                type="text"
                value={formData.price ? (formData.price / 100).toFixed(2).replace('.', ',') : ''}
                onChange={(e) => {
                  // Allow only numbers, comma, and dot
                  const value = e.target.value.replace(/[^0-9,.]/g, '');
                  // Format as currency while typing
                  const parts = value.split(',');
                  if (parts.length <= 2) {
                    const numericValue = value ? parseFloat(value.replace(',', '.')) * 100 : null;
                    setFormData(prev => ({ ...prev, price: numericValue }));
                  }
                }}
                placeholder="0,00"
              />
              <p className="text-sm text-gray-500 mt-1">
                Exemplo: 19,90 para R$ 19,90
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="public"
              checked={formData.public}
              onCheckedChange={handleTogglePublic}
            />
            <Label htmlFor="public">Jornada Pública</Label>
          </div>
        </div>

        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/journeys')}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </form>
    </div>
  );
}