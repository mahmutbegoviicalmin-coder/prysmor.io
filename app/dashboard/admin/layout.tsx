import { currentUser } from '@clerk/nextjs/server';
import { redirect }    from 'next/navigation';

const ADMIN_EMAILS = ['mahmutbegoviic.almin@gmail.com'];

export const metadata = { title: 'Admin — Prysmor' };

export default async function DashboardAdminLayout({ children }: { children: React.ReactNode }) {
  const user   = await currentUser();
  const emails = user?.emailAddresses?.map(e => e.emailAddress) ?? [];
  if (!emails.some(e => ADMIN_EMAILS.includes(e))) redirect('/dashboard');
  return <>{children}</>;
}
