import React, { useCallback, useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import AuthForm from './components/AuthForm';
import DashboardFilter from './components/DashboardFilter';
import type { FilterState } from './components/DashboardFilter';
import TestSelector from './components/TestSelector';
import ShorthandDrill from './components/ShorthandDrill';
import PredictiveGrammarDrill from './components/PredictiveGrammarDrill';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import Leaderboard from './components/Leaderboard';
import type { Database } from './supabaseClient';

type IeltsTest = Database['public']['Tables']['ielts_tests']['Row'];
type DrillMode = 'shorthand' | 'grammar';
type Tab = 'drill' | 'analytics' | 'leaderboard';

const defaultFilter: FilterState = {
  section: 'listening',
  sourceId: null,
  testNumber: null,
  isFullTest: true,
  partNumber: null,
};

function AppShell() {
  const { isAuthLoading, session, user, profile, section, signOut } = useAppContext();

  const [tab, setTab] = useState<Tab>('drill');
  const [filter, setFilter] = useState<FilterState>(defaultFilter);
  const [selectedTest, setSelectedTest] = useState<IeltsTest | null>(null);
  const [drillMode, setDrillMode] = useState<DrillMode>('shorthand');
  const [drillActive, setDrillActive] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; total: number; band: number } | null>(null);

  const handleFilterChange = useCallback((f: FilterState) => {
    setFilter(f);
    setSelectedTest(null);
    setDrillActive(false);
    setLastResult(null);
  }, []);

  const handleTestSelect = useCallback((t: IeltsTest) => {
    setSelectedTest(t);
    setDrillActive(false);
    setLastResult(null);
  }, []);

  const handleStartDrill = useCallback(() => {
    if (!selectedTest) return;
    setDrillActive(true);
    setLastResult(null);
  }, [selectedTest]);

  const handleComplete = useCallback((score: number, total: number) => {
    const rawBand = Math.min(9, (score / total) * 9);
    const band = Math.round(rawBand * 2) / 2;
    setLastResult({ score, total, band });
    setDrillActive(false);
  }, []);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !user) return <AuthForm />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top nav */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 font-black text-xl tracking-tight">IELTS Drill Pro</span>
            <span className="hidden sm:block text-slate-600 text-sm">|</span>
            <span className="hidden sm:block text-slate-400 text-sm capitalize">{section}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-400 text-sm hidden sm:block">
              {profile?.username}
            </span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-900/40 border border-emerald-700 px-2 py-0.5 rounded-full">
              {(profile?.total_xp ?? 0).toLocaleString()} XP
            </span>
            <button
              onClick={signOut}
              className="text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-1.5 rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b border-slate-800 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1">
          {(['drill', 'analytics', 'leaderboard'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-semibold capitalize transition-colors border-b-2 ${
                tab === t
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── DRILL TAB ── */}
        {tab === 'drill' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar */}
            <div className="space-y-6">
              <DashboardFilter onChange={handleFilterChange} />

              {/* Drill mode selector */}
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-3">
                <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-widest">
                  Drill Mode
                </h3>
                <div className="space-y-2">
                  {([
                    {
                      id: 'shorthand',
                      label: '2-Word Compression',
                      desc: 'Keyword mapping & distractor neutralisation',
                      color: 'emerald',
                    },
                    {
                      id: 'grammar',
                      label: 'Predictive Grammar',
                      desc: 'Grammar-slot pre-loading for gap-fills',
                      color: 'purple',
                    },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setDrillMode(m.id as DrillMode)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        drillMode === m.id
                          ? m.id === 'shorthand'
                            ? 'border-emerald-500 bg-emerald-900/20'
                            : 'border-purple-500 bg-purple-900/20'
                          : 'border-slate-700 hover:border-slate-500'
                      }`}
                    >
                      <p className={`text-sm font-bold ${drillMode === m.id ? (m.id === 'shorthand' ? 'text-emerald-300' : 'text-purple-300') : 'text-slate-300'}`}>
                        {m.label}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Test list */}
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5">
                <h3 className="text-slate-200 font-semibold text-sm uppercase tracking-widest mb-4">
                  Select Test
                </h3>
                <TestSelector
                  filter={filter}
                  onSelect={handleTestSelect}
                  selectedTestId={selectedTest?.id ?? null}
                />
              </div>
            </div>

            {/* Main content area */}
            <div className="lg:col-span-2 space-y-6">
              {/* Last result banner */}
              {lastResult && (
                <div className="bg-slate-900 border border-emerald-700 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-emerald-400 font-bold text-sm">Session complete</p>
                    <p className="text-slate-300 text-sm mt-0.5">
                      {lastResult.score}/{lastResult.total} correct · Band {lastResult.band}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setLastResult(null);
                      setDrillActive(false);
                    }}
                    className="text-xs border border-slate-600 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg"
                  >
                    New Drill
                  </button>
                </div>
              )}

              {/* Pre-drill launch */}
              {!drillActive && selectedTest && !lastResult && (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 text-center space-y-4">
                  <h2 className="text-xl font-bold text-slate-100">{selectedTest.title}</h2>
                  <p className="text-slate-400 text-sm">
                    {selectedTest.section} · Part {selectedTest.part_number}
                    {selectedTest.test_number ? ` · Test ${selectedTest.test_number}` : ''}
                  </p>
                  <div className={`inline-block border rounded-full px-4 py-1.5 text-sm font-bold ${
                    drillMode === 'shorthand'
                      ? 'border-emerald-600 text-emerald-400 bg-emerald-900/30'
                      : 'border-purple-600 text-purple-400 bg-purple-900/30'
                  }`}>
                    {drillMode === 'shorthand' ? '2-Word Compression Drill' : 'Predictive Grammar Drill'}
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={handleStartDrill}
                      className={`px-8 py-3 font-bold rounded-xl text-white text-lg transition-colors ${
                        drillMode === 'shorthand'
                          ? 'bg-emerald-600 hover:bg-emerald-500'
                          : 'bg-purple-700 hover:bg-purple-600'
                      }`}
                    >
                      Start Drill
                    </button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!drillActive && !selectedTest && !lastResult && (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-12 text-center">
                  <p className="text-4xl mb-4">🎯</p>
                  <h2 className="text-slate-200 font-bold text-xl mb-2">Select a Test</h2>
                  <p className="text-slate-400 text-sm max-w-sm mx-auto">
                    Use the filter panel to find your target test, choose a drill mode, and begin active recall training.
                  </p>
                </div>
              )}

              {/* Active drill */}
              {drillActive && selectedTest && (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6">
                  {drillMode === 'shorthand' ? (
                    <ShorthandDrill
                      testId={selectedTest.id}
                      onComplete={handleComplete}
                    />
                  ) : (
                    <PredictiveGrammarDrill
                      testId={selectedTest.id}
                      onComplete={handleComplete}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {tab === 'analytics' && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-black text-slate-100 mb-6">Performance Analytics</h1>
            <AnalyticsDashboard />
          </div>
        )}

        {/* ── LEADERBOARD TAB ── */}
        {tab === 'leaderboard' && (
          <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-black text-slate-100 mb-6">Global Rankings</h1>
            <Leaderboard />
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}