// src/app/admin/journeys/new/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'react-hot-toast';
import { parsePriceToCents } from '@/lib/price';

export default function NewJourneyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    imageUrl: '',
    price: '',
    public: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTogglePublic = (checked: boolean) => {
    setFormData(prev => ({ ...prev, public: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/journeys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          price: formData.price ? parsePriceToCents(formData.price) : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao criar jornada');
      }

      toast.success('Jornada criada com sucesso!');
      router.push('/admin/journeys');
    } catch (error) {
      console.error('Error creating journey:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao criar jornada');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Nova Jornada</h1>
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
                value={formData.imageUrl}
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
                value={formData.price}
                onChange={(e) => {
                  // Allow only numbers, comma, and dot
                  const value = e.target.value.replace(/[^0-9,.]/g, '');
                  // Format as currency while typing
                  const parts = value.split(',');
                  if (parts.length <= 2) {
                    setFormData(prev => ({ ...prev, price: value }));
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
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Salvando...' : 'Criar Jornada'}
          </Button>
        </div>
      </form>
    </div>
  );
}