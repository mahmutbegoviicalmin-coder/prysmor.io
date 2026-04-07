'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { TopUpModal } from './TopUpModal';

export function TopUpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-[8px] text-[12px] font-semibold bg-[#A3FF12] text-[#050505] hover:bg-[#B6FF3C] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Top up credits
      </button>
      <TopUpModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
