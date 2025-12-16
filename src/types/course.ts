export interface Course {
  id: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  price?: number | null;
  public: boolean;
  level: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCourseInput {
  title: string;
  description: string;
  imageUrl?: string;
  price?: number;
  level: string;
}

export interface UpdateCourseInput extends Partial<CreateCourseInput> {
  id: string;
}
