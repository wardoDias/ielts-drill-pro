import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import type { Database } from '../supabaseClient';
import type { FilterState } from './DashboardFilter';

type IeltsTest = Database['public']['Tables']['ielts_tests']['Row'];

interface Props {
  filter: FilterState;
  onSelect: (test: IeltsTest) => void;
  selectedTestId: string | null;
}

export default function TestSelector({ filter, onSelect, selectedTestId }: Props) {
  const [tests, setTests] = useState<IeltsTest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let query = supabase
      .from('ielts_tests')
      .select('*')
      .eq('section', filter.section)
      .order('title');

    if (filter.sourceId) query = query.eq('source_id', filter.sourceId);
    if (filter.testNumber) query = query.eq('test_number', filter.testNumber);
    if (!filter.isFullTest && filter.partNumber) query = query.eq('part_number', filter.partNumber);

    query.then(({ data }) => {
      setTests((data as IeltsTest[]) ?? []);
      setLoading(false);
    });
  }, [filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <div className="w-6 h-6 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 text-center">
        <p className="text-slate-400 text-sm">No tests match your filter. Adjust your selection above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
        {tests.length} test{tests.length > 1 ? 's' : ''} available
      </p>
      {tests.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t)}
          className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
            selectedTestId === t.id
              ? 'border-emerald-500 bg-emerald-900/30 text-emerald-200'
              : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800'
          }`}
        >
          <p className="font-semibold text-sm">{t.title}</p>
          <p className="text-xs text-slate-500 mt-0.5">
            {t.section} · Part {t.part_number}
            {t.test_number ? ` · Test ${t.test_number}` : ''}
          </p>
        </button>
      ))}
    </div>
  );
}