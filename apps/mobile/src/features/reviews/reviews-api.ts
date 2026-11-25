import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewGrade, ReviewQueueItem, ReviewQueueResponse, SubmitReviewInput } from '@/contracts';
import { randomUUID } from 'expo-crypto';
import { apiFetch } from '@/lib/api-client';
import { queueOrSend } from '@/lib/offline/outbox';

export const QUEUE_KEY = ['reviews', 'queue'] as const;

/**
 * Hàng đợi "Ôn tập": câu hỏi bài tập + thẻ tự tạo, server trộn theo `dueAt` và cắt 20.
 * Key được persist offline (R2), nên danh sách thẻ vẫn mở được khi mất mạng.
 */
export function useReviewQueue() {
  return useQuery({
    queryKey: QUEUE_KEY,
    queryFn: () => apiFetch<ReviewQueueResponse>('/api/v1/reviews/queue'),
  });
}

export const itemId = (i: ReviewQueueItem) => (i.kind === 'question' ? i.questionId : i.id);

export type GradeInput = { kind: ReviewQueueItem['kind']; id: string; grade: ReviewGrade };

export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * Mỗi lượt chấm một key, giữ nguyên khi xếp hàng offline: outbox gửi lại đúng key nên server
     * chỉ ghi một lần. `reviewedAt` lấy lúc chấm, không phải lúc gửi. `undefined` = đã xếp hàng.
     */
    mutationFn: ({ kind, id, grade }: GradeInput): Promise<unknown> => {
      const path =
        kind === 'question'
          ? `/api/v1/reviews/${encodeURIComponent(id)}`
          : `/api/v1/cards/${encodeURIComponent(id)}/review`;
      const body: SubmitReviewInput = { grade, reviewedAt: new Date().toISOString() };
      const key = randomUUID();
      return queueOrSend({ method: 'POST', path, body, eventId: key }, () =>
        apiFetch<unknown>(path, { method: 'POST', body, headers: { 'Idempotency-Key': key } }),
      );
    },
    onSuccess: (result, { kind, id }) => {
      // Gửi được hay đã xếp hàng đều bỏ thẻ khỏi cache để phiên ôn đi tiếp khi offline.
      const match = (i: ReviewQueueItem) => i.kind === kind && itemId(i) === id;
      queryClient.setQueryData<ReviewQueueResponse>(QUEUE_KEY, (old) => {
        if (!old || !old.items.some(match)) return old;
        return {
          ...old,
          items: old.items.filter((i) => !match(i)),
          dueCount: Math.max(0, old.dueCount - 1),
        };
      });
      if (result) {
        void queryClient.invalidateQueries({ queryKey: ['reviews'] });
        if (kind === 'flashcard') void queryClient.invalidateQueries({ queryKey: ['decks'] });
      }
    },
  });
}
