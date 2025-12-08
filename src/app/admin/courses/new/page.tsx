"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "react-hot-toast";
import { parsePriceToCents } from "@/lib/price";

export default function NewCoursePage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [price, setPrice] = useState("");
  const [discountPrice, setDiscountPrice] = useState("");
  const [discountEnabled, setDiscountEnabled] = useState(false);
  const [level, setLevel] = useState("iniciante");
  const [isPublic, setIsPublic] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/courses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          description,
          imageUrl: imageUrl || null,
          price: parsePriceToCents(price),
          discountPrice: discountEnabled && discountPrice ? parsePriceToCents(discountPrice) : 0,
          discountEnabled,
          level,
          public: isPublic,
        }),
      });

      if (!response.ok) {
        throw new Error("Falha ao criar curso");
      }

      toast.success("Curso criado com sucesso!");
      router.push("/admin/courses");
    } catch (error) {
      console.error("Error creating course:", error);
      toast.error("Erro ao criar curso");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Novo Curso</h1>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div>
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={5}
          />
        </div>

        <div>
          <Label htmlFor="imageUrl">URL da Imagem (opcional)</Label>
          <Input
            id="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="price">Preço (em reais)</Label>
          <Input
            id="price"
            type="text"
            value={price}
            onChange={(e) => {
              // Allow only numbers, comma, and dot
              const value = e.target.value.replace(/[^0-9,.]/g, '');
              // Format as currency while typing
              const parts = value.split(',');
              if (parts.length <= 2) {
                setPrice(value);
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
            checked={discountEnabled}
            onCheckedChange={setDiscountEnabled}
          />
          <Label htmlFor="discountEnabled">Ativar Desconto</Label>
        </div>

        {discountEnabled && (
          <div>
            <Label htmlFor="discountPrice">Preço com Desconto (em reais)</Label>
            <Input
              id="discountPrice"
              type="text"
              value={discountPrice}
              onChange={(e) => {
                // Allow only numbers, comma, and dot
                const value = e.target.value.replace(/[^0-9,.]/g, '');
                // Format as currency while typing
                const parts = value.split(',');
                if (parts.length <= 2) {
                  setDiscountPrice(value);
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
            value={level}
            onChange={(e) => setLevel(e.target.value)}
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
            checked={isPublic}
            onCheckedChange={setIsPublic}
          />
          <Label htmlFor="public">Público</Label>
        </div>

        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/courses")}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Salvando..." : "Salvar Curso"}
          </Button>
        </div>
      </form>
    </div>
  );
}