'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  advance,
  countFocus,
  formatClock,
  initialState,
  normalizeSettings,
  parseTimer,
  pause,
  remaining,
  start,
  todayKey,
  type DayCount,
  type Phase,
  type PomodoroSettings,
  type TimerState,
} from './pomodoro';
const KEY = 'learn.pomodoro';
interface Stored {
  settings: PomodoroSettings;
  timer: TimerState;
  day: DayCount | null;
}

function load(): Stored {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as {
      settings?: unknown;
      timer?: unknown;
      day?: DayCount;
    } | null;
    const settings = normalizeSettings(raw?.settings);
    const timer = parseTimer(raw?.timer ? JSON.stringify(raw.timer) : null);
    const day =
      raw?.day && typeof raw.day.date === 'string' && typeof raw.day.done === 'number'
        ? raw.day
        : null;
    return { settings, timer: timer ?? initialState(settings), day };
  } catch {
    const settings = normalizeSettings(undefined);
    return { settings, timer: initialState(settings), day: null };
  }
}

function save(value: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* bị chặn lưu trữ: bộ đếm vẫn chạy, chỉ không nhớ khi tải lại */
  }
}

/** Báo hết giờ bằng thông báo trình duyệt nếu đã được cho phép; trình duyệt chặn thì bỏ qua. */
function notify(finished: Phase) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(finished === 'focus' ? 'Hết giờ học' : 'Hết giờ nghỉ', {
      tag: 'learn-pomodoro',
    });
  } catch {
    /* Android Chrome chỉ cho thông báo qua service worker */
  }
}

function useSession() {
  const [stored, setStored] = useState<Stored | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState<Phase | null>(null);

  useEffect(() => setStored(load()), []);

  const update = (next: Stored) => {
    setStored(next);
    save(next);
  };

  useEffect(() => {
    if (!stored?.timer.running) return;
    const id = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      const out = advance(stored.timer, stored.settings, at);
      if (out.finished) {
        update({
          ...stored,
          timer: out.state,
          day: countFocus(stored.day, out.finished, todayKey(new Date(at))),
        });
        setFinished(out.finished);
        notify(out.finished);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [stored]);

  const clock = stored ? formatClock(remaining(stored.timer, now)) : '';

  function toggle() {
    if (!stored) return;
    const at = Date.now();
    setNow(at);
    setFinished(null);
    update({
      ...stored,
      timer: stored.timer.running ? pause(stored.timer, at) : start(stored.timer, at),
    });
  }
  function startFocus() {
    if (!stored || stored.timer.running) return;
    const at = Date.now();
    const timer = stored.timer.phase === 'focus' ? stored.timer : initialState(stored.settings);
    setNow(at);
    setFinished(null);
    update({ ...stored, timer: start(timer, at) });
  }

  return { stored, now, finished, clock, update, setFinished, toggle, startFocus };
}
const Session = createContext<ReturnType<typeof useSession> | null>(null);
export function PomodoroProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  return <Session.Provider value={session}>{children}</Session.Provider>;
}
export function usePomodoro() {
  const session = useContext(Session);
  if (!session) throw new Error('PomodoroProvider is required');
  return session;
}
