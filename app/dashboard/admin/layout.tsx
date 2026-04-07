import { currentUser } from '@clerk/nextjs/server';
import { redirect }    from 'next/navigation';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

export const metadata = { title: 'Admin — Prysmor' };

export default async function DashboardAdminLayout({ children }: { children: React.ReactNode }) {
  const user  = await currentUser();
  const email = user?.emailAddresses?.[0]?.emailAddress ?? '';
  if (!ADMIN_EMAILS.includes(email)) redirect('/dashboard');
  return <>{children}</>;
}
