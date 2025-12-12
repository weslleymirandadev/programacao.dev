import prisma from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";

export function isAdmin(user: { role: UserRole } | undefined) {
  return !!user && user.role === "ADMIN";
}

export function isModerator(user: { role: UserRole } | undefined) {
  return !!user && user.role === "MODERATOR";
}

export function isStaff(user: { role: UserRole } | undefined) {
  return !!user && (user.role === "ADMIN" || user.role === "MODERATOR");
}

//
// --------------------- COURSE ACCESS ---------------------
//

/**
 * Verifica se o usuário tem acesso válido (não-expirado) a um course.
 * Usa a tabela Enrollment (que contém startDate e endDate).
 */
export async function hasCourseAccess(userId: string, courseId: string) {
  const now = new Date();
  // Para cursos: endDate pode ser null (acesso vitalício) ou maior que hoje (acesso ativo)
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      userId,
      courseId,
      OR: [
        { endDate: null }, // Acesso vitalício
        { endDate: { gte: now } } // Acesso ativo (não expirado)
      ]
    },
  });

  return !!enrollment;
}

//
// --------------------- LESSON ACCESS ---------------------
//

/**
 * Verifica se o usuário tem acesso à lesson consultando o course pai.
 */
export async function hasLessonAccess(userId: string, lessonId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      module: {
        select: {
          courseId: true,
        },
      },
    },
  });

  if (!lesson || !lesson.module) return false;
  return hasCourseAccess(userId, lesson.module.courseId);
}

//
// --------------------- FORUM (POSTS) ---------------------
//

/**
 * Verifica se um post do fórum (ForumPost) é público ou vinculado a um curso/jornada
 * e se o usuário tem acesso a esse contexto.
 */
export async function canViewPost(userId: string | null, postId: string) {
  const post = await prisma.forumPost.findUnique({
    where: { id: postId },
    select: { cursoId: true},
  });

  if (!post) return false;

  // público (nenhum contexto)
  if (!post.cursoId) return true;

  // post do curso: checar enrollment válido
  if (post.cursoId) {
    if (!userId) return false;
    const ok = await hasCourseAccess(userId, post.cursoId);
    return ok;
  }

  return false;
}

/**
 * Mesma regra para responder: precisa conseguir ver o post primeiro.
 */
export async function canReplyPost(userId: string | null, postId: string) {
  if (!userId) return false;
  return canViewPost(userId, postId);
}

export async function canModeratePost(user: { id: string; role: UserRole } | undefined, postId: string) {
  if (!user) return false;
  if (isAdmin(user) || isModerator(user)) return true;

  return false;
}

export async function canCreatePost(userId: string | null, cursoId?: string | null) {
  if (!userId) return false;

  if (!cursoId) return true; // criar post público

  if (cursoId) return hasCourseAccess(userId, cursoId);

  return false;
}

