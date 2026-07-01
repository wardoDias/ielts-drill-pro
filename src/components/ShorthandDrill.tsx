import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAppContext } from '../context/AppContext';
import type { Database } from '../supabaseClient';

type Question = Database['public']['Tables']['questions']['Row'];

interface ShorthandDrillProps {
  testId: string;
  onComplete: (score: number, total: number, timeSpentSecs: number) => void;
}

type QuestionState = 'idle' | 'correct' | 'wrong' | 'revealed';

interface ItemState {
  userAnswer: string;
  state: QuestionState;
  shuffledShorthands: string[];
  showFullPrompt: boolean;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

export default function ShorthandDrill({ testId, onComplete }: ShorthandDrillProps) {
  const { user, addScore } = useAppContext();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [itemStates, setItemStates] = useState<ItemState[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    setLoading(true);
    supabase
      .from('questions')
      .select('*')
      .eq('test_id', testId)
      .order('question_number')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const qs = data as Question[];
          setQuestions(qs);
          setItemStates(
            qs.map((q) => ({
              userAnswer: '',
              state: 'idle',
              shuffledShorthands: shuffleArray([
                ...q.shorthand_variants,
                ...q.distractor_options.slice(0, 2),
              ]),
              showFullPrompt: false,
            }))
          );
        }
        setLoading(false);
        startRef.current = Date.now();
      });
  }, [testId]);

  const updateItem = useCallback(
    (index: number, patch: Partial<ItemState>) => {
      setItemStates((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
    },
    []
  );

  const handleTagClick = useCallback(
    (qIndex: number, tag: string) => {
      if (itemStates[qIndex].state !== 'idle') return;
      updateItem(qIndex, { userAnswer: tag });
    },
    [itemStates, updateItem]
  );

  const handleCheckSingle = useCallback(
    (qIndex: number) => {
      const q = questions[qIndex];
      const item = itemStates[qIndex];
      const correct = q.shorthand_variants.some(
        (v) => normalise(v) === normalise(item.userAnswer)
      );
      updateItem(qIndex, { state: correct ? 'correct' : 'wrong' });
    },
    [questions, itemStates, updateItem]
  );

  const handleReveal = useCallback(
    (qIndex: number) => {
      updateItem(qIndex, { state: 'revealed', showFullPrompt: true });
    },
    [updateItem]
  );

  const handleTogglePrompt = useCallback(
    (qIndex: number) => {
      setItemStates((prev) => {
        const next = [...prev];
        next[qIndex] = {
          ...next[qIndex],
          showFullPrompt: !next[qIndex].showFullPrompt,
        };
        return next;
      });
    },
    []
  );

  const handleSubmitAll = useCallback(async () => {
    const finalStates = itemStates.map((item, i) => {
      if (item.state !== 'idle') return item;
      const q = questions[i];
      const correct = q.shorthand_variants.some(
        (v) => normalise(v) === normalise(item.userAnswer)
      );
      return { ...item, state: correct ? ('correct' as const) : ('wrong' as const) };
    });

    setItemStates(finalStates);
    const finalScore = finalStates.filter((s) => s.state === 'correct').length;
    setScore(finalScore);
    setSubmitted(true);

    const timeSpentSecs = Math.round((Date.now() - startRef.current) / 1000);
    const rawBand = Math.min(9, Math.max(0, (finalScore / questions.length) * 9));
    const band = Math.round(rawBand * 2) / 2;

    if (user) {
      await supabase.from('user_progress').insert({
        user_id: user.id,
        test_id: testId,
        section: 'listening',
        score: finalScore,
        total_items: questions.length,
        band_score: band,
        time_spent_secs: timeSpentSecs,
      });

      addScore({
        testId,
        score: finalScore,
        totalItems: questions.length,
        bandScore: band,
        timeSpentSecs,
        completedAt: new Date().toISOString(),
      });
    }

    onComplete(finalScore, questions.length, timeSpentSecs);
  }, [itemStates, questions, user, testId, addScore, onComplete]);

  const stateColour = (s: QuestionState) => {
    switch (s) {
      case 'correct': return 'border-emerald-500 bg-emerald-900/30';
      case 'wrong':   return 'border-red-500 bg-red-900/30';
      case 'revealed': return 'border-amber-500 bg-amber-900/20';
      default: return 'border-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (questions.length === 0) {
    return <p className="text-slate-400 text-center py-12">No questions available for this test.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Shorthand Compression Drill</h2>
          <p className="text-slate-400 text-sm mt-1">
            Select the 2-word shorthand that best encodes each question. Use keyword mapping to identify the core concept.
          </p>
        </div>
        {submitted && (
          <div className="text-right">
            <p className="text-2xl font-black text-emerald-400">
              {score}/{questions.length}
            </p>
            <p className="text-xs text-slate-400">
              Est. Band {Math.round((Math.min(9, (score / questions.length) * 9)) * 2) / 2}
            </p>
          </div>
        )}
      </div>

      {questions.map((q, qi) => {
        const item = itemStates[qi];
        return (
          <div
            key={q.id}
            className={`border rounded-xl p-5 space-y-4 transition-colors ${stateColour(item.state)}`}
          >
            {/* Question number + toggle */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                  Q{q.question_number} · {q.question_type.replace(/_/g, ' ')}
                </span>
                {item.showFullPrompt ? (
                  <p className="text-slate-200 mt-1 leading-relaxed">{q.prompt}</p>
                ) : (
                  <p className="text-slate-400 italic text-sm mt-1">
                    [Prompt hidden — select the correct shorthand first]
                  </p>
                )}
              </div>
              <button
                onClick={() => handleTogglePrompt(qi)}
                className="text-xs text-slate-400 hover:text-emerald-400 border border-slate-600 rounded px-2 py-1 flex-shrink-0 transition-colors"
              >
                {item.showFullPrompt ? 'Hide' : 'Reveal'}
              </button>
            </div>

            {/* Grammar hint */}
            <div className="bg-slate-800/60 rounded-lg px-3 py-2">
              <p className="text-xs text-slate-400">
                <span className="text-amber-400 font-semibold">Grammar slot: </span>
                {q.grammar_hint}
              </p>
            </div>

            {/* Shorthand tag cloud */}
            <div className="flex flex-wrap gap-2">
              {item.shuffledShorthands.map((tag) => {
                const isSelected = item.userAnswer === tag;
                const isCorrectTag = q.shorthand_variants.includes(tag);
                const reveal = item.state !== 'idle';

                let tagStyle = 'border-slate-600 text-slate-300 hover:border-emerald-500 hover:text-emerald-300';
                if (isSelected && !reveal) tagStyle = 'border-emerald-500 bg-emerald-900/40 text-emerald-200';
                if (reveal && isCorrectTag) tagStyle = 'border-emerald-500 bg-emerald-900/50 text-emerald-200';
                if (reveal && isSelected && !isCorrectTag) tagStyle = 'border-red-500 bg-red-900/40 text-red-300';
                if (reveal && !isSelected && !isCorrectTag) tagStyle = 'border-slate-700 text-slate-500 opacity-50';

                return (
                  <button
                    key={tag}
                    onClick={() => handleTagClick(qi, tag)}
                    disabled={item.state !== 'idle'}
                    className={`border rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${tagStyle}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            {/* Action row */}
            {item.state === 'idle' && !submitted && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleCheckSingle(qi)}
                  disabled={!item.userAnswer}
                  className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Check
                </button>
                <button
                  onClick={() => handleReveal(qi)}
                  className="border border-slate-600 text-slate-400 hover:text-white text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  Give Up
                </button>
              </div>
            )}

            {/* Feedback */}
            {item.state === 'correct' && (
              <p className="text-emerald-400 text-sm font-semibold">✓ Correct — strong keyword mapping.</p>
            )}
            {item.state === 'wrong' && (
              <div className="text-sm">
                <p className="text-red-400 font-semibold">✗ Incorrect.</p>
                <p className="text-slate-400 mt-1">
                  Accepted: <span className="text-emerald-400 font-medium">{q.shorthand_variants.join(', ')}</span>
                </p>
                <p className="text-slate-400 mt-0.5">Correct answer: <span className="text-white font-medium">{q.correct_answer}</span></p>
              </div>
            )}
            {item.state === 'revealed' && (
              <div className="text-sm">
                <p className="text-amber-400 font-semibold">Revealed.</p>
                <p className="text-slate-400 mt-1">
                  Answer: <span className="text-white font-medium">{q.correct_answer}</span>
                </p>
                <p className="text-slate-400 mt-0.5">
                  Accepted shorthands: <span className="text-emerald-400">{q.shorthand_variants.join(', ')}</span>
                </p>
              </div>
            )}
          </div>
        );
      })}

      {!submitted && (
        <button
          onClick={handleSubmitAll}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors text-lg"
        >
          Submit All & Score
        </button>
      )}

      {submitted && (
        <div className="bg-slate-900 border border-emerald-700 rounded-xl p-6 text-center">
          <p className="text-3xl font-black text-emerald-400 mb-1">
            {score} / {questions.length}
          </p>
          <p className="text-slate-300 text-sm">
            Estimated band:{' '}
            <span className="text-white font-bold">
              {Math.round((Math.min(9, (score / questions.length) * 9)) * 2) / 2}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}