import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';

interface ProgressRow {
  band_score: number;
  completed_at: string;
  section: string;
  test_id: string;
}

interface ErrorRow {
  question_type: string;
}

interface LinePoint {
  date: string;
  band: number;
}

interface PieSlice {
  name: string;
  value: number;
}

const PIE_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899'];

const CustomTooltipLine = ({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-emerald-400 font-bold">Band {payload[0].value.toFixed(1)}</p>
    </div>
  );
};

export default function AnalyticsDashboard() {
  const { user, section } = useAppContext();
  const [lineData, setLineData] = useState<LinePoint[]>([]);
  const [pieData, setPieData] = useState<PieSlice[]>([]);
  const [avgBand, setAvgBand] = useState<number>(0);
  const [totalTests, setTotalTests] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const fetchProgress = async () => {
      const { data: progressData } = await supabase
        .from('user_progress')
        .select('band_score, completed_at, section, test_id')
        .eq('user_id', user.id)
        .eq('section', section)
        .order('completed_at', { ascending: true })
        .limit(50);

      if (progressData && progressData.length > 0) {
        const pts = (progressData as ProgressRow[]).map((r) => ({
          date: new Date(r.completed_at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
          }),
          band: Number(r.band_score),
        }));
        setLineData(pts);
        setTotalTests(pts.length);
        setAvgBand(pts.reduce((a, b) => a + b.band, 0) / pts.length);
      } else {
        setLineData([]);
        setTotalTests(0);
        setAvgBand(0);
      }
    };

    const fetchErrors = async () => {
      const { data: progressRows } = await supabase
        .from('user_progress')
        .select('test_id')
        .eq('user_id', user.id)
        .eq('section', section);

      if (!progressRows || progressRows.length === 0) {
        setPieData([]);
        return;
      }

      const testIds = (progressRows as { test_id: string }[]).map((r) => r.test_id);

      const { data: qRows } = await supabase
        .from('questions')
        .select('question_type')
        .in('test_id', testIds);

      if (!qRows) { setPieData([]); return; }

      const counts: Record<string, number> = {};
      (qRows as ErrorRow[]).forEach((q) => {
        counts[q.question_type] = (counts[q.question_type] ?? 0) + 1;
      });

      const slices: PieSlice[] = Object.entries(counts)
        .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
        .sort((a, b) => b.value - a.value);

      setPieData(slices);
    };

    Promise.all([fetchProgress(), fetchErrors()]).finally(() => setLoading(false));
  }, [user, section]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Avg Band</p>
          <p className="text-3xl font-black text-emerald-400">
            {avgBand > 0 ? avgBand.toFixed(1) : '—'}
          </p>
        </div>
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Sessions</p>
          <p className="text-3xl font-black text-slate-200">{totalTests}</p>
        </div>
      </div>

      {/* Band trajectory */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <h3 className="text-slate-200 font-semibold mb-4">Band Score Trajectory</h3>
        {lineData.length > 0 ? (
        <ResponsiveContainer width="100%" height={220}>
          <>
            <LineChart data={lineData}>
              {/* ... */}
            </LineChart>
            <p>Some extra text</p>
          </>
        </ResponsiveContainer>
        ) : (
        <p className="text-slate-500 text-sm text-center py-8">
          Complete more tests to see your trajectory.
        </p>
      )}
      </div>

      {/* Error distribution */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
        <h3 className="text-slate-200 font-semibold mb-4">Question Type Distribution</h3>
        {pieData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} (${(percent * 100).toFixed(0)}%)`
                }
                labelLine={false}
              >
                {pieData.map((_, index) => (
                  <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Legend
                formatter={(value) => (
                  <span className="text-slate-300 text-xs">{value}</span>
                )}
              />
              <Tooltip
  formatter={(value: number) => [value, 'questions']}
  contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8 }}
  labelStyle={{ color: '#94a3b8' }}
/>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-sm text-center py-8">
            No error data yet. Complete a test to analyse failure modes.
          </p>
        )}
      </div>
    </div>
  );
}