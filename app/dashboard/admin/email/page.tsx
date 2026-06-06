import { EmailSection } from '@/app/admin/EmailSection';

export const metadata = { title: 'Email | Admin' };

export default function AdminEmailPage() {
  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10 max-w-[1200px]">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-[#A3FF12] shadow-[0_0_6px_#A3FF12]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#A3FF12]">Admin</span>
        </div>
        <h1 className="text-[24px] sm:text-[28px] font-bold text-white tracking-tight">Email marketing</h1>
        <p className="text-[12px] text-[#4B5563] mt-1">Resend · Automated upsell funnels</p>
      </div>
      <EmailSection />
    </div>
  );
}
