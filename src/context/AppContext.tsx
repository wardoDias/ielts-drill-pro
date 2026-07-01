import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import type { Database } from '../supabaseClient';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Section = 'listening' | 'reading';

interface ScoreEntry {
  testId: string;
  score: number;
  totalItems: number;
  bandScore: number;
  timeSpentSecs: number;
  completedAt: string;
}

interface AppState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  section: Section;
  isLoading: boolean;
  isAuthLoading: boolean;
  sessionScores: ScoreEntry[];
  error: string | null;
}

type AppAction =
  | { type: 'SET_SESSION'; payload: { session: Session | null; user: User | null } }
  | { type: 'SET_PROFILE'; payload: Profile | null }
  | { type: 'SET_SECTION'; payload: Section }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_AUTH_LOADING'; payload: boolean }
  | { type: 'ADD_SCORE'; payload: ScoreEntry }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_SESSION_SCORES' };

const initialState: AppState = {
  session: null,
  user: null,
  profile: null,
  section: 'listening',
  isLoading: false,
  isAuthLoading: true,
  sessionScores: [],
  error: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_SESSION':
      return { ...state, session: action.payload.session, user: action.payload.user };
    case 'SET_PROFILE':
      return { ...state, profile: action.payload };
    case 'SET_SECTION':
      return { ...state, section: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_AUTH_LOADING':
      return { ...state, isAuthLoading: action.payload };
    case 'ADD_SCORE':
      return { ...state, sessionScores: [...state.sessionScores, action.payload] };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_SESSION_SCORES':
      return { ...state, sessionScores: [] };
    default:
      return state;
  }
}

interface AppContextValue extends AppState {
  setSection: (section: Section) => void;
  setLoading: (loading: boolean) => void;
  addScore: (entry: ScoreEntry) => void;
  clearSessionScores: () => void;
  setError: (msg: string | null) => void;
  signOut: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) {
      dispatch({ type: 'SET_PROFILE', payload: data });
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      dispatch({
        type: 'SET_SESSION',
        payload: { session, user: session?.user ?? null },
      });
      if (session?.user) fetchProfile(session.user.id);
      dispatch({ type: 'SET_AUTH_LOADING', payload: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        dispatch({
          type: 'SET_SESSION',
          payload: { session, user: session?.user ?? null },
        });
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          dispatch({ type: 'SET_PROFILE', payload: null });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const setSection = useCallback((section: Section) => {
    dispatch({ type: 'SET_SECTION', payload: section });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, []);

  const addScore = useCallback((entry: ScoreEntry) => {
    dispatch({ type: 'ADD_SCORE', payload: entry });
  }, []);

  const clearSessionScores = useCallback(() => {
    dispatch({ type: 'CLEAR_SESSION_SCORES' });
  }, []);

  const setError = useCallback((msg: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: msg });
  }, []);

  const signOut = useCallback(async () => {
  await supabase.auth.signOut();
  dispatch({ type: 'SET_PROFILE', payload: null });
  dispatch({ type: 'CLEAR_SESSION_SCORES' });
}, []);

return (
  <AppContext.Provider
    value={{
      ...state,
      setSection,
      setLoading,
      addScore,
      clearSessionScores,
      setError,
      signOut,
    }}
  >
    {children}
  </AppContext.Provider>
);
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppProvider');
  return ctx;
}
