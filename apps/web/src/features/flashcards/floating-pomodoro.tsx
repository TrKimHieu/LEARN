'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { initialState } from './pomodoro';
import { usePomodoro } from './pomodoro-session';

type Point = { x: number; y: number };

function constrain(point: Point, el: HTMLElement): Point {
  return {
    x: Math.max(0, Math.min(point.x, window.innerWidth - el.offsetWidth)),
    y: Math.max(0, Math.min(point.y, window.innerHeight - el.offsetHeight)),
  };
}

export function FloatingPomodoro() {
  const { stored, clock, toggle, finished } = usePomodoro();
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const [position, setPosition] = useState<Point | null>(null);
  const box = useRef<HTMLElement>(null);
  const drag = useRef<Point | null>(null);
  const visible =
    !!stored &&
    pathname !== '/focus' &&
    (stored.timer.running ||
      !!finished ||
      stored.timer.remainingMs !== initialState(stored.settings, stored.timer.phase).remainingMs);

  useEffect(() => {
    const el = box.current;
    if (!visible || !el) return;
    const fit = () => setPosition((p) => p && constrain(p, el));
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [visible]);

  if (!visible || !stored) return null;
  const phase = stored.timer.phase === 'focus' ? 'Học' : 'Nghỉ';
  return (
    <aside
      ref={box}
      aria-label="Pomodoro nổi"
      className="fixed bottom-24 right-4 z-40 rounded-card border border-line bg-panel p-3 text-fg shadow-raised md:bottom-5"
      style={
        position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined
      }
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="touch-none select-none cursor-grab text-xs text-fg-muted focus-ring active:cursor-grabbing"
          aria-label="Di chuyển Pomodoro bằng cách kéo hoặc dùng phím mũi tên"
          onPointerDown={(e) => {
            if (!e.isPrimary || e.button !== 0 || !box.current) return;
            const rect = box.current.getBoundingClientRect();
            drag.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId) && drag.current && box.current)
              setPosition(
                constrain(
                  { x: e.clientX - drag.current.x, y: e.clientY - drag.current.y },
                  box.current,
                ),
              );
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            const moves: Record<string, Point> = {
              ArrowLeft: { x: -16, y: 0 },
              ArrowRight: { x: 16, y: 0 },
              ArrowUp: { x: 0, y: -16 },
              ArrowDown: { x: 0, y: 16 },
            };
            const move = moves[e.key];
            if (!move || !box.current) return;
            e.preventDefault();
            const r = box.current.getBoundingClientRect();
            setPosition(constrain({ x: r.left + move.x, y: r.top + move.y }, box.current));
          }}
        >
          ⠿ {phase}
        </button>
        {compact && <span className="font-semibold tabular-nums">{clock}</span>}
        <button
          type="button"
          aria-expanded={!compact}
          aria-label={compact ? 'Mở rộng Pomodoro' : 'Thu gọn Pomodoro'}
          onClick={() => setCompact(!compact)}
          className="ml-auto px-2 focus-ring"
        >
          {compact ? '+' : '−'}
        </button>
      </div>
      {!compact && (
        <div className="flex items-center gap-3">
          <Link
            href="/focus"
            aria-label="Mở trang Tập trung"
            className="font-display text-2xl font-bold tabular-nums focus-ring"
          >
            {clock}
          </Link>
          <button
            type="button"
            onClick={toggle}
            className="rounded-control bg-primary px-3 py-2 text-sm text-primary-fg focus-ring"
          >
            {stored.timer.running ? 'Tạm dừng' : finished ? 'Bắt đầu' : 'Tiếp tục'}
          </button>
        </div>
      )}
    </aside>
  );
}
