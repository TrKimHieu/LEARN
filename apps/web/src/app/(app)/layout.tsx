'use client';

import { ProtectedRoute } from '@/features/auth/protected-route';
import { AppShell } from '@/features/shell/app-shell';

import { PomodoroProvider } from '@/features/flashcards/pomodoro-session';
import { FloatingPomodoro } from '@/features/flashcards/floating-pomodoro';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <PomodoroProvider>
        <AppShell>{children}</AppShell>
        <FloatingPomodoro />
      </PomodoroProvider>
    </ProtectedRoute>
  );
}
