/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { getFirebaseAuth } from './lib/firebase';
import { onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { BrowserRouter, Routes, Route, useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, Plus, LogOut, User as UserIcon, Gamepad2 } from 'lucide-react';

// Optimized Lazy Loading
const Dashboard = lazy(() => import('./components/Dashboard'));
const HostGame = lazy(() => import('./components/HostGame'));
const PlayerGame = lazy(() => import('./components/PlayerGame'));
const QuizCreator = lazy(() => import('./components/QuizCreator'));
import GameBackground from './components/GameBackground';

// Loading Fallback Component
const LoadingScreen = () => (
  <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center">
    <motion.div 
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="w-12 h-12 border-4 border-[#00FF00] border-t-transparent rounded-full shadow-[0_0_20px_rgba(0,255,0,0.5)]"
    />
  </div>
);

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("FATAL UI ERROR:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6 text-center font-sans">
          <div className="bg-red-500/10 border-2 border-red-500/30 p-12 rounded-[3rem] max-w-lg">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4 text-red-500">СИСТЕМЫН АЛДАА</h2>
            <p className="text-white/60 mb-8 font-medium">{this.state.error?.message || "Үл мэдэгдэх алдаа гарлаа"}</p>
            <button 
              onClick={() => window.location.href = '/dashboard'}
              className="w-full bg-white text-black py-4 rounded-xl font-black uppercase italic tracking-tighter"
            >
              ДАХИН АЧААЛАХ
            </button>
          </div>
        </div>
      );
    }
    // @ts-ignore
    return this.props.children;
  }
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const [authError, setAuthError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    // DO NOT touch auth on join routes
    if (location.pathname.startsWith('/join')) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, [location.pathname]);

  const login = async () => {
    console.log("Login process started. Hostname:", window.location.hostname);
    setLoggingIn(true);
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    const auth = getFirebaseAuth();
    
    // Use popup and catch early errors
    try {
      console.log("Attempting Firebase signInWithPopup...");
      const result = await signInWithPopup(auth, provider);
      console.log("Login SUCCESS:", result.user.email);
      // Auth state listener handles the rest
    } catch (err: any) {
      console.error("Firebase Login Detailed Error:", err);
      
      const domain = window.location.hostname;
      if (err.code === 'auth/unauthorized-domain') {
        const isLocal = domain === 'localhost' || domain === '127.0.0.1';
        setAuthError(isLocal 
          ? `Хөгжүүлэлтийн горимд (Localhost) нэвтрэхийн тулд Firebase Console > Authentication > Settings > Authorized domains хэсэгт "localhost"-ыг нэмнэ үү.`
          : `Энэ домэйн (${domain}) Firebase Console-д бүртгэлгүй байна. (Authorized domains хэсэгт нэмнэ үү)`
        );
      } else if (err.code === 'auth/popup-closed-by-user') {
        setAuthError("Нэвтрэх цонх хаагдсан байна. Дахин оролдоно уу.");
      } else if (err.code === 'auth/popup-blocked') {
        setAuthError("Попап цонх хаагдсан байна. Хөтчийн тохиргооноос попап зөвшөөрнө үү.");
      } else if (err.code === 'auth/operation-not-allowed') {
        setAuthError("Google-ээр нэвтрэх эрх идэвхгүй байна. Firebase Console-д идэвхжүүлнэ үү.");
      } else {
        setAuthError(`Алдаа (${err.code}): ${err.message || "Нэвтрэхэд алдаа гарлаа"}`);
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const logout = () => signOut(getFirebaseAuth()).then(() => navigate('/'));

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-[#0F0F0F] text-white font-sans selection:bg-[#00FF00] selection:text-black">
      <ErrorBoundary>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={
              user ? <Navigate to="/dashboard" /> : (
                <div className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center">
                  <GameBackground />

                  <motion.section 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="relative z-10 flex flex-col items-center justify-center p-6 text-center w-full max-w-4xl"
                  >
                    <motion.div 
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 200, damping: 20 }}
                      className="mb-12 p-6 bg-[#00FF00] text-black rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,255,0,0.3)] neon-glow-green"
                    >
                      <Trophy size={80} />
                    </motion.div>

                    <div className="space-y-2 mb-12">
                      <motion.h1 
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-[14vw] md:text-[120px] font-display font-black uppercase italic tracking-[-0.05em] leading-[0.85] text-white"
                      >
                        QUIZ<br/>
                        <span className="text-[#00FF00] inline-block scale-110 origin-left">SPARK</span>
                      </motion.h1>
                      <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.4 }}
                        className="text-white/40 max-w-md mx-auto text-sm md:text-lg font-black uppercase tracking-[0.3em] italic"
                      >
                        Ухаанаа уралдуулж, мэдлэгээ бататга
                      </motion.p>
                    </div>
                    
                    <motion.div 
                      initial={{ y: 40, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="flex flex-col gap-6 w-full max-w-sm"
                    >
                      <button 
                        onClick={() => navigate('/join')}
                        className="group relative overflow-hidden bg-white text-black py-8 px-12 rounded-[2rem] font-black text-3xl uppercase italic tracking-tighter transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:shadow-[0_20px_60px_rgba(0,255,0,0.3)] hover:bg-[#00FF00]"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-[#00FF00] to-[#00FFFF] opacity-0 group-hover:opacity-20 transition-opacity"></div>
                        <span className="relative z-10 flex items-center justify-center gap-4">
                          ТОГЛООМД НЭГДЭХ <Play size={32} className="fill-current transition-transform duration-300 group-hover:translate-x-2" />
                        </span>
                      </button>

                      <div className="flex items-center gap-6 py-4">
                        <div className="h-px flex-1 bg-white/5"></div>
                        <span className="text-white/10 text-[10px] font-black uppercase tracking-[0.5em]">Зохион байгуулах</span>
                        <div className="h-px flex-1 bg-white/5"></div>
                      </div>

                      <button 
                        onClick={login}
                        disabled={loggingIn}
                        className="group flex flex-col items-center justify-center gap-3 py-5 px-8 rounded-2xl border-2 border-white/5 hover:border-[#00FF00]/50 hover:bg-[#00FF00]/5 transition-all text-white/40 hover:text-white font-black uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-3">
                          {loggingIn ? (
                            <motion.div 
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                            />
                          ) : (
                            <UserIcon size={16} />
                          )}
                          {loggingIn ? 'УНШИЖ БАЙНА...' : 'ЗОХИОН БАЙГУУЛАГЧААР НЭВТРЭХ'}
                        </div>
                      </button>

                      <AnimatePresence>
                        {authError && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-[10px] font-bold uppercase tracking-wider text-center"
                          >
                            {authError}
                            <div className="mt-2 pt-2 border-t border-red-500/20 lowercase font-mono">
                              config: {window.location.hostname}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </motion.section>

                  <div className="absolute bottom-12 left-12 hidden lg:block text-[10px] font-mono text-white/10 uppercase tracking-[0.2em] vertical-text">
                    Сорилт // Эхлэл // Тэмцээн
                  </div>
                  <div className="absolute top-12 right-12 hidden lg:block text-[10px] font-mono text-white/10 uppercase tracking-[0.2em]">
                    EST. 2026 // v2.0.4
                  </div>
                </div>
              )
            } />

            <Route path="/dashboard" element={
              user ? (
                <div className="pt-20">
                  <nav className="fixed top-0 left-0 right-0 h-16 border-b border-white/10 bg-[#0F0F0F]/80 backdrop-blur-md z-50 px-6 flex items-center justify-between">
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
                      <div className="bg-[#00FF00] text-black p-1 rounded-sm rotate-3">
                        <Gamepad2 size={24} />
                      </div>
                      <span className="font-display text-xl font-bold tracking-tighter uppercase italic">QuizSpark</span>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="hidden md:flex items-center gap-2 text-sm font-medium text-white/60">
                        <UserIcon size={14} />
                        {user.displayName}
                      </div>
                      <button 
                        onClick={logout}
                        className="p-2 hover:bg-white/5 rounded-full transition-colors group"
                        title="Гарах"
                      >
                        <LogOut size={20} className="group-hover:text-[#FF4444]" />
                      </button>
                    </div>
                  </nav>
                  <Dashboard 
                    onStartGame={(quizId) => navigate(`/host/${quizId}`)}
                    onCreateQuiz={() => navigate('/create')}
                    onEditQuiz={(quiz) => navigate(`/edit/${quiz.id}`)}
                    onJoinAsPlayer={() => navigate('/join')}
                  />
                </div>
              ) : <Navigate to="/" />
            } />

            <Route path="/host/:quizId" element={
              user ? <HostGameWrapper onClose={() => navigate('/dashboard')} /> : <Navigate to="/" />
            } />

            <Route path="/join" element={<PlayerGame onClose={() => navigate(user ? '/dashboard' : '/')} />} />
            <Route path="/join/:initialPin" element={<PlayerGame onClose={() => navigate(user ? '/dashboard' : '/')} />} />

            <Route path="/create" element={
              user ? <QuizCreator onClose={() => navigate('/dashboard')} /> : <Navigate to="/" />
            } />
            
            <Route path="/edit/:quizId" element={
              user ? <QuizCreatorEditWrapper onClose={() => navigate('/dashboard')} /> : <Navigate to="/" />
            } />
          </Routes>
        </Suspense>
      </ErrorBoundary>

      <div className="fixed inset-0 pointer-events-none z-[-1] opacity-[0.03]" 
           style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '32px 32px' }}>
      </div>
    </div>
  );
}

function HostGameWrapper({ onClose }: { onClose: () => void }) {
  const { quizId } = useParams();
  if (!quizId) return <LoadingScreen />;
  return <HostGame quizId={quizId} onClose={onClose} />;
}

function QuizCreatorEditWrapper({ onClose }: { onClose: () => void }) {
  const { quizId } = useParams();
  const [quiz, setQuiz] = useState<any>(null);

  useEffect(() => {
    import('./lib/firebase').then(({ db }) => {
      import('firebase/firestore').then(({ doc, getDoc }) => {
        getDoc(doc(db, 'quizzes', quizId!)).then(snap => {
          if (snap.exists()) setQuiz({ id: snap.id, ...snap.data() });
        });
      });
    });
  }, [quizId]);

  if (!quiz) return <LoadingScreen />;
  return <QuizCreator editQuiz={quiz} onClose={onClose} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
