import { ADMIN_EMAILS } from '@/lib/admin/auth';
import { getSessionUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Admin | Prysmor' };

export default async function DashboardAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session || !ADMIN_EMAILS.includes(session.email)) {
    redirect('/dashboard');
  }
  return <>{children}</>;
}
