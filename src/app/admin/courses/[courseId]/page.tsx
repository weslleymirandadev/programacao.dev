"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "react-hot-toast";
import { parsePriceToCents } from "@/lib/price";

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

export default function EditCoursePage() {
  const params = useParams();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const courseId = params.courseId as string;
        console.log('Fetching course with ID:', courseId);
        const response = await fetch(`/api/courses/${courseId}`);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response:', errorText);
          throw new Error(`Falha ao carregar curso: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('Course data received:', data);
        setCourse(data);
      } catch (error) {
        console.error("Error fetching course:", error);
        toast.error("Erro ao carregar curso");
        router.push("/admin/courses");
      } finally {
        setIsLoading(false);
      }
    };

    if (params.courseId) {
      fetchCourse();
    }
  }, [params.courseId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course) return;

    setIsSaving(true);

    try {
      const response = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...course,
          // Prices are already in cents in the state
          price: course.price,
          discountPrice: course.discountPrice,
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao atualizar curso");
      }

      toast.success("Curso atualizado com sucesso!");
      router.push("/admin/courses");
    } catch (error) {
      console.error("Error updating course:", error);
      toast.error("Erro ao atualizar curso");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>Curso não encontrado</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Editar Curso</h1>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div>
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            value={course.title}
            onChange={(e) => setCourse({ ...course, title: e.target.value })}
            required
          />
        </div>

        <div>
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={course.description}
            onChange={(e) => setCourse({ ...course, description: e.target.value })}
            required
            rows={5}
          />
        </div>

        <div>
          <Label htmlFor="imageUrl">URL da Imagem (opcional)</Label>
          <Input
            id="imageUrl"
            type="url"
            value={course.imageUrl || ""}
            onChange={(e) => setCourse({ ...course, imageUrl: e.target.value || null })}
          />
        </div>

        <div>
          <Label htmlFor="price">Preço (em reais)</Label>
          <Input
            id="price"
            type="text"
            value={course.price !== null ? (course.price / 100).toFixed(2).replace('.', ',') : ''}
            onChange={(e) => {
              // Allow only numbers, comma, and dot
              let value = e.target.value.replace(/[^0-9,.]/g, '');
              // Format as currency while typing
              const parts = value.split(',');
              if (parts.length <= 2) {
                // Convert to cents when saving
                const priceInCents = value ? Math.round(parseFloat(value.replace(',', '.')) * 100) : null;
                setCourse({
                  ...course,
                  price: priceInCents
                });
              }
            }}
            placeholder="0,00"
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            Exemplo: 19,90 para R$ 19,90
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="discountEnabled"
            checked={course.discountEnabled}
            onCheckedChange={(checked) => setCourse({ ...course, discountEnabled: checked })}
          />
          <Label htmlFor="discountEnabled">Ativar Desconto</Label>
        </div>

        {course.discountEnabled && (
          <div>
            <Label htmlFor="discountPrice">Preço com Desconto (em reais)</Label>
            <Input
              id="discountPrice"
              type="text"
              value={(course.discountPrice / 100).toFixed(2).replace('.', ',')}
              onChange={(e) => {
                // Allow only numbers, comma, and dot
                let value = e.target.value.replace(/[^0-9,.]/g, '');
                // Format as currency while typing
                const parts = value.split(',');
                if (parts.length <= 2) {
                  // Convert to cents when saving
                  const discountInCents = value ? Math.round(parseFloat(value.replace(',', '.')) * 100) : 0;
                  setCourse({
                    ...course,
                    discountPrice: discountInCents
                  });
                }
              }}
              placeholder="0,00"
            />
            <p className="text-sm text-gray-500 mt-1">
              Exemplo: 14,90 para R$ 14,90
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="level">Nível</Label>
          <select
            id="level"
            value={course.level}
            onChange={(e) => setCourse({ ...course, level: e.target.value })}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="iniciante">Iniciante</option>
            <option value="intermediario">Intermediário</option>
            <option value="avancado">Avançado</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <Switch
            id="public"
            checked={course.public}
            onCheckedChange={(checked) => setCourse({ ...course, public: checked })}
          />
          <Label htmlFor="public">Público</Label>
        </div>

        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/courses")}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </form>
    </div>
  );
}