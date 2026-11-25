import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { SubmitFeedbackInput } from '@/contracts';
import { Button, Card, Field, InlineError, Segmented, Txt } from '@/components/ui';
import { useOffline } from '@/features/offline/offline-provider';
import { errorText } from '@/lib/api-client';
import { space } from '@/theme/tokens';
import { useSubmitFeedback } from './feedback-api';
import { askable, parseHistory, record, type FeedbackItem } from './feedback-policy';

/** Cùng key với lịch sử web để dễ đối chiếu; lưu trong kv của tài khoản trên máy. */
const KEY = 'learn.feedback';
const SCORES = ['1', '2', '3', '4', '5'] as const;
type Score = (typeof SCORES)[number];

const ENDS: Record<FeedbackItem['question'], [string, string]> = {
  QUALITY: ['Chưa tốt', 'Rất tốt'],
  UNDERSTANDING: ['Chưa nắm', 'Nắm chắc'],
  USEFULNESS: ['Ít ích', 'Rất hữu ích'],
};

const itemKey = (i: FeedbackItem) => `${i.topic}:${i.subjectId ?? '*'}:${i.question}`;

/** Gom câu trả lời theo (chủ đề, đối tượng) thành từng lượt gửi; góp ý chữ đi theo lượt đầu (như web). */
function toRequests(items: FeedbackItem[], scores: Record<string, number>, comment: string) {
  const groups = new Map<string, SubmitFeedbackInput>();
  for (const item of items) {
    const key = `${item.topic}:${item.subjectId ?? ''}`;
    const group: SubmitFeedbackInput = groups.get(key) ?? {
      topic: item.topic,
      answers: [],
      ...(item.subjectId ? { subjectId: item.subjectId } : {}),
    };
    group.answers.push({ question: item.question, score: scores[itemKey(item)]! });
    groups.set(key, group);
  }
  const list = [...groups.values()];
  if (comment.trim() && list[0]) list[0].comment = comment.trim();
  return list;
}

/**
 * Thẻ hỏi ý kiến nhỏ trong luồng màn hình, port của `apps/web/src/features/feedback/feedback-prompt.tsx`.
 * Chỉ hiện câu chưa hỏi (theo `feedback-policy`). Không có kv (Testing) thì không hỏi.
 */
export function FeedbackPrompt({
  title,
  items,
  when = true,
  delayMs = 1200,
}: {
  title: string;
  items: FeedbackItem[];
  when?: boolean;
  delayMs?: number;
}) {
  const { kv } = useOffline();
  const submit = useSubmitFeedback();
  const [shown, setShown] = useState<FeedbackItem[] | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [thanked, setThanked] = useState(false);
  const signature = items.map(itemKey).join('|');

  useEffect(() => {
    if (!when || shown || !kv) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void kv.get(KEY).then((raw) => {
      const pending = askable(items, parseHistory(raw), new Date());
      if (alive && pending.length) timer = setTimeout(() => setShown(pending), delayMs);
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // `signature` đại diện cho `items`: mảng mới ở mỗi lần render không làm hỏi lại.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, signature, delayMs, shown, kv]);

  useEffect(() => {
    if (!thanked) return;
    const id = setTimeout(() => setShown([]), 1500);
    return () => clearTimeout(id);
  }, [thanked]);

  if (!shown || shown.length === 0 || !kv) return null;
  const pending = shown;
  const store = kv;
  const complete = pending.every((i) => scores[itemKey(i)] !== undefined);

  async function save(outcome: 'voted' | 'dismissed') {
    await store.set(KEY, JSON.stringify(record(parseHistory(await store.get(KEY)), pending, outcome, new Date())));
  }

  async function send() {
    try {
      for (const req of toRequests(pending, scores, comment)) await submit.mutateAsync(req);
      await save('voted');
      setThanked(true);
    } catch {
      /* hiện qua `submit.error` */
    }
  }

  return (
    <Card>
      {thanked ? (
        <Txt variant="bodyStrong" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>
          Cảm ơn bạn!
        </Txt>
      ) : (
        <View style={{ gap: space.md }}>
          <Txt variant="heading">{title}</Txt>
          {pending.map((item) => {
            const [low, high] = ENDS[item.question];
            const value = scores[itemKey(item)];
            return (
              <View key={itemKey(item)} style={{ gap: space.xs }}>
                <Txt variant="smallStrong">{item.label}</Txt>
                <Segmented<Score | ''>
                  label={item.label}
                  value={value ? (String(value) as Score) : ''}
                  options={SCORES.map((s) => ({ value: s, label: s }))}
                  onChange={(v) => setScores((s) => ({ ...s, [itemKey(item)]: Number(v) }))}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Txt variant="caption" tone="subtle">{low}</Txt>
                  <Txt variant="caption" tone="subtle">{high}</Txt>
                </View>
              </View>
            );
          })}
          {commenting ? (
            <Field label="Góp ý thêm" multiline maxLength={500} value={comment} onChangeText={setComment} />
          ) : (
            <Button label="Thêm góp ý" variant="ghost" onPress={() => setCommenting(true)} />
          )}
          {submit.isError && <InlineError>{errorText(submit.error, 'Chưa gửi được, vui lòng thử lại.')}</InlineError>}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm }}>
            <Button
              label="Bỏ qua"
              variant="ghost"
              onPress={() => {
                setShown([]);
                void save('dismissed');
              }}
            />
            <Button label="Gửi" disabled={!complete} loading={submit.isPending} onPress={() => void send()} />
          </View>
        </View>
      )}
    </Card>
  );
}
