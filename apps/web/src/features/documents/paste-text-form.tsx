'use client';

import { useState } from 'react';
import { Button, Field, InlineError, Input, Textarea } from '@/components/ui';
import { errorText } from '@/lib/api-client';
import { useImportText } from './documents-api';
import { buildPastedText } from './paste-text';

/** Nguồn tài liệu thứ hai cạnh vùng tải tệp: dán văn bản (ghi chú, bài đọc). */
export function PasteTextForm({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const send = useImportText(courseId);
  const input = buildPastedText(title, text);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex min-h-11 items-center rounded-md text-sm font-medium text-accent underline underline-offset-2 hover:no-underline focus-ring md:min-h-0"
      >
        Hoặc dán văn bản
      </button>
    );
  }

  function close() {
    setOpen(false);
    setTitle('');
    setText('');
    send.reset();
  }

  return (
    <form
      className="mt-3 grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (input) send.mutate(input, { onSuccess: close });
      }}
    >
      <Field label="Tiêu đề" htmlFor="paste-title">
        <Input id="paste-title" value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Nội dung" htmlFor="paste-text">
        <Textarea id="paste-text" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {send.isError && (
        <InlineError>{errorText(send.error, 'Chưa thêm được văn bản, vui lòng thử lại.')}</InlineError>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!input} loading={send.isPending} className="max-md:h-11">
          Thêm tài liệu
        </Button>
        <Button type="button" variant="ghost" onClick={close} className="max-md:h-11">
          Huỷ
        </Button>
      </div>
    </form>
  );
}
