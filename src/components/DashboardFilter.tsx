import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import type { Database } from '../supabaseClient';

type TestSource = Database['public']['Tables']['test_sources']['Row'];
type Section = 'listening' | 'reading';

export interface FilterState {
  section: Section;
  sourceId: number | null;
  testNumber: number | null;
  isFullTest: boolean;
  partNumber: number | null;
}

interface Props {
  onChange: (filter: FilterState) => void;
}

export default function DashboardFilter({ onChange }: Props) {
  const { section, setSection } = useAppContext();
  const [sources, setSources] = useState<TestSource[]>([]);
  const [availableTestNumbers, setAvailableTestNumbers] = useState<number[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<number | null>(null);
  const [selectedTestNumber, setSelectedTestNumber] = useState<number | null>(null);
  const [isFullTest, setIsFullTest] = useState(true);
  const [partNumber, setPartNumber] = useState<number | null>(1);

  useEffect(() => {
    supabase.from('test_sources').select('*').order('name').then(({ data }) => {
      if (data) setSources(data);
    });
  }, []);

  useEffect(() => {
    if (!selectedSourceId) {
      setAvailableTestNumbers([]);
      setSelectedTestNumber(null);
      return;
    }
    const src = sources.find((s) => s.id === selectedSourceId);
    if (!src?.is_book) {
      setAvailableTestNumbers([]);
      setSelectedTestNumber(null);
      return;
    }
    supabase
      .from('ielts_tests')
      .select('test_number')
      .eq('source_id', selectedSourceId)
      .eq('section', section)
      .not('test_number', 'is', null)
      .order('test_number')
      .then(({ data }) => {
        if (data) {
          const nums = [...new Set(data.map((r) => r.test_number as number))];
          setAvailableTestNumbers(nums);
          setSelectedTestNumber(nums[0] ?? null);
        }
      });
  }, [selectedSourceId, section, sources]);

  useEffect(() => {
    onChange({
      section,
      sourceId: selectedSourceId,
      testNumber: selectedTestNumber,
      isFullTest,
      partNumber: isFullTest ? null : partNumber,
    });
  }, [section, selectedSourceId, selectedTestNumber, isFullTest, partNumber, onChange]);

  const selectedSource = sources.find((s) => s.id === selectedSourceId);
  const isBook = selectedSource?.is_book ?? false;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-5">
      <h2 className="text-slate-200 font-semibold text-lg">Test Filter</h2>

      {/* Section toggle */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Section
        </label>
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {(['listening', 'reading'] as Section[]).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex-1 py-2 text-sm font-bold capitalize transition-colors ${
                section === s
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Source selection */}
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
          Source
        </label>
        <select
          value={selectedSourceId ?? ''}
          onChange={(e) => setSelectedSourceId(e.target.value ? Number(e.target.value) : null)}
          className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Sources</option>
          {sources.map((src) => (
            <option key={src.id} value={src.id}>
              {src.name}
            </option>
          ))}
        </select>
      </div>

      {/* Test number — only for books */}
      {isBook && availableTestNumbers.length > 0 && (
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Test Number
          </label>
          <select
            value={selectedTestNumber ?? ''}
            onChange={(e) =>
              setSelectedTestNumber(e.target.value ? Number(e.target.value) : null)
            }
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
          >
            <option value="">Any Test</option>
            {availableTestNumbers.map((n) => (
              <option key={n} value={n}>
                Test {n}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Full test toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-300">Full Test</span>
        <button
          onClick={() => setIsFullTest((v) => !v)}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            isFullTest ? 'bg-emerald-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
              isFullTest ? 'translate-x-7' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Part / Section selector — only when not full test */}
      {!isFullTest && (
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            {section === 'listening' ? 'Section' : 'Passage'}
          </label>
          <select
            value={partNumber ?? 1}
            onChange={(e) => setPartNumber(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-500"
          >
            {[1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>
                {section === 'listening' ? `Section ${p}` : `Passage ${p}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}