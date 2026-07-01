import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import type { Database } from '../supabaseClient';

type Question = Database['public']['Tables']['questions']['Row'];

interface Props {
  testId: string;
  onComplete: (score: number, total: number, timeSpentSecs: number) => void;
}

type GrammarClass = 'noun' | 'verb' | 'adjective' | 'plural noun' | 'number' | 'proper noun' | 'adverb' | 'date/time';

const GRAMMAR_CLASSES: GrammarClass[] = [
  'noun', 'verb', 'adjective', 'plural noun', 'number', 'proper noun', 'adverb', 'date/time',
];

function detectExpectedClass(hint: string): GrammarClass {
  const h = hint.toLowerCase();
  if (h.includes('plural')) return 'plural noun';
  if (h.includes('proper noun') || h.includes('name')) return 'proper noun';
  if (h.includes('number') || h.includes('digit') || h.includes('year') || h.includes('integer')) return 'number';
  if (h.includes('date') || h.includes('time') || h.includes('hour')) return 'date/time';
  if (h.includes('adverb') || h.includes('adverbial')) return 'adverb';
  if (h.includes('verb')) return 'verb';
  if (h.includes('adjective')) return 'adjective';
  return 'noun';
}

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

type StepState = 'grammar_prediction' | 'answer_entry' | 'graded';

interface ItemState {
  step: StepState;
  predictedClass: GrammarClass | null;
  classCorrect: boolean | null;
  userAnswer: string;
  answerCorrect: boolean | null;
}

export default function PredictiveGrammarDrill({ testId, onComplete }: Props) {
  const { user, addScore } = useAppContext();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [states, setStates] = useState<ItemState[]>([]);
  const [loading, setLoading] = useState(true);
  const [allDone, setAllDone] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    setLoading(true);
    supabase
      .from('questions')
      .select('*')
      .eq('test_id', testId)
      .in('question_type', [
        'form_completion', 'note_completion', 'table_completion',
        'sentence_completion', 'summary_completion',
      ])
      .order('question_number')
      .then(({ data }) => {
        const qs = (data as Question[]) ?? [];
        setQuestions(qs);
        setStates(
          qs.map(() => ({
            step: 'grammar_prediction',
            predictedClass: null,
            classCorrect: null,
            userAnswer: '',
            answerCorrect: null,
          }))
        );
        setLoading(false);
        startRef.current = Date.now();
      });
  }, [testId]);

  const updateState = useCallback((index: number, patch: Partial<ItemState>) => {
    setStates((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }, []);

  const handleClassSelect = useCallback(
    (qIndex: number, cls: GrammarClass) => {
      const q = questions[qIndex];
      const expected = detectExpectedClass(q.grammar_hint);
      const isCorrect = cls === expected;
      updateState(qIndex, {
        predictedClass: cls,
        classCorrect: isCorrect,
        step: 'answer_entry',
      });
    },
    [questions, updateState]
  );

  const handleAnswerChange = useCallback(
    (qIndex: number, value: string) => {
      updateState(qIndex, { userAnswer: value });
    },
    [updateState]
  );

  const handleGrade = useCallback(
    (qIndex: number) => {
      const q = questions[qIndex];
      const item = states[qIndex];
      const isCorrect =
        normalise(item.userAnswer) === normalise(q.correct_answer) ||
        q.shorthand_variants.some((v) => normalise(v) === normalise(item.userAnswer));
      updateState(qIndex, { step: 'graded', answerCorrect: isCorrect });
    },
    [questions, states, updateState]
  );

  const handleSubmitAll = useCallback(async () => {
    const finalStates = states.map((item, i) => {
      if (item.step === 'graded') return item;
      const q = questions[i];
      const isCorrect =
        normalise(item.userAnswer) === normalise(q.correct_answer) ||
        q.shorthand_variants.some((v) => normalise(v) === normalise(item.userAnswer));
      return { ...item, step: 'graded' as StepState, answerCorrect: isCorrect };
    });
    setStates(finalStates);

    const score = finalStates.filter((s) => s.answerCorrect).length;
    setTotalScore(score);
    setAllDone(true);

    const timeSpentSecs = Math.round((Date.now() - startRef.current) / 1000);
    const rawBand = Math.min(9, (score / questions.length) * 9);
    const band = Math.round(rawBand * 2) / 2;

    if (user) {
      await supabase.from('user_progress').insert({
        user_id: user.id,
        test_id: testId,
        section: 'reading',
        score,
        total_items: questions.length,
        band_score: band,
        time_spent_secs: timeSpentSecs,
      });
      addScore({ testId, score, totalItems: questions.length, bandScore: band, timeSpentSecs, completedAt: new Date().toISOString() });
    }

    onComplete(score, questions.length, timeSpentSecs);
  }, [states, questions, user, testId, addScore, onComplete]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <p className="text-slate-400 text-center py-12">
        No gap-fill questions found for this test.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Predictive Grammar Drill</h2>
        <p className="text-slate-400 text-sm mt-1">
          Before seeing the test, predict the grammatical class of the missing word. This activates grammar-slot pre-loading.
        </p>
      </div>

      {questions.map((q, qi) => {
        const item = states[qi];
        const expected = detectExpectedClass(q.grammar_hint);

        const borderColor =
          item.step === 'graded'
            ? item.answerCorrect
              ? 'border-emerald-600'
              : 'border-red-600'
            : item.step === 'answer_entry'
            ? 'border-purple-600'
            : 'border-slate-700';

        return (
          <div
            key={q.id}
            className={`border rounded-xl p-5 space-y-4 transition-colors ${borderColor}`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                Q{q.question_number}
              </span>
              <span className="text-xs text-slate-500">{q.question_type.replace(/_/g, ' ')}</span>
              {item.step !== 'grammar_prediction' && (
                <span
                  className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full border ${
                    item.classCorrect
                      ? 'text-emerald-400 border-emerald-600 bg-emerald-900/30'
                      : 'text-red-400 border-red-600 bg-red-900/30'
                  }`}
                >
                  {item.classCorrect ? `✓ ${item.predictedClass}` : `✗ ${item.predictedClass} (was: ${expected})`}
                </span>
              )}
            </div>

            {/* Step 1: Grammar prediction */}
            {item.step === 'grammar_prediction' && (
              <div className="space-y-3">
                <p className="text-slate-300 text-sm">
                  The blank follows:{' '}
                  <span className="text-white font-semibold italic">
                    "…{q.prompt.slice(0, 60)}…"
                  </span>
                </p>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">
                  Predict the grammatical class of the missing word:
                </p>
                <div className="flex flex-wrap gap-2">
                  {GRAMMAR_CLASSES.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => handleClassSelect(qi, cls)}
                      className="border border-slate-600 text-slate-300 hover:border-purple-500 hover:text-purple-300 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Answer entry */}
            {item.step === 'answer_entry' && (
              <div className="space-y-3">
                <p className="text-slate-200 leading-relaxed">{q.prompt}</p>
                <p className="text-xs text-amber-400">
                  Grammar hint: <span className="text-amber-300">{q.grammar_hint}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Word limit: {q.word_limit} word{q.word_limit > 1 ? 's' : ''}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={item.userAnswer}
                    onChange={(e) => handleAnswerChange(qi, e.target.value)}
                    placeholder={`Answer (max ${q.word_limit} word${q.word_limit > 1 ? 's' : ''})`}
                    className="flex-1 bg-slate-800 border border-slate-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-purple-500 placeholder-slate-500 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && item.userAnswer.trim()) handleGrade(qi);
                    }}
                  />
                  <button
                    onClick={() => handleGrade(qi)}
                    disabled={!item.userAnswer.trim()}
                    className="bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Check
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Graded */}
            {item.step === 'graded' && (
              <div className="space-y-2">
                <p className="text-slate-200 leading-relaxed">{q.prompt}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`text-sm font-bold ${item.answerCorrect ? 'text-emerald-400' : 'text-red-400'}`}
                  >
                    {item.answerCorrect ? '✓ Correct' : '✗ Incorrect'}
                  </span>
                  <span className="text-slate-400 text-sm">
                    Your answer:{' '}
                    <span className="text-white">{item.userAnswer || '(blank)'}</span>
                  </span>
                </div>
                {!item.answerCorrect && (
                  <p className="text-slate-400 text-sm">
                    Correct answer:{' '}
                    <span className="text-emerald-400 font-semibold">{q.correct_answer}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!allDone && (
        <button
          onClick={handleSubmitAll}
          className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-3 rounded-xl transition-colors text-lg"
        >
          Submit & Grade All
        </button>
      )}

      {allDone && (
        <div className="bg-slate-900 border border-purple-700 rounded-xl p-6 text-center">
          <p className="text-3xl font-black text-purple-400 mb-1">
            {totalScore} / {questions.length}
          </p>
          <p className="text-slate-300 text-sm">
            Grammar prediction accuracy:{' '}
            <span className="text-white font-bold">
              {Math.round(
                (states.filter((s) => s.classCorrect).length / questions.length) * 100
              )}
              %
            </span>
          </p>
        </div>
      )}
    </div>
  );
}