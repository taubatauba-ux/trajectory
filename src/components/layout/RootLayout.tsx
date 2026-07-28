import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export function RootLayout() {
  return (
    <div className="mx-auto min-h-screen max-w-md bg-bg text-ink">
      <Outlet />
      <BottomNav />
    </div>
  );
}
