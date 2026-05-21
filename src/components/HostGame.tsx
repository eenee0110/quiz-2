/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/// <reference types="vite/client" />

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getFirebaseAuth, db, OperationType, handleFirestoreError } from '../lib/firebase';
import { 
  collection, 
  doc, 
  getDoc,
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where,
  getDocs, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Users, X, Play, ChevronRight, Trophy, BarChart3, Clock, Zap, Pause, PlayCircle, QrCode, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { Quiz, Question, GameSession, Player, Response, SessionStatus } from '../types';
import GameBackground from './GameBackground';

interface HostGameProps {
  quizId: string;
  onClose: () => void;
}

export default function HostGame({ quizId, onClose }: HostGameProps) {
  const auth = getFirebaseAuth();
  const [session, setSession] = useState<GameSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [responses, setResponses] = useState<Response[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize Session & Listeners
  useEffect(() => {
    let unsubS = () => {};
    let unsubP = () => {};
    let unsubR = () => {};

    const init = async () => {
      if (!quizId) {
        setError('Quiz ID is missing');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        if (!db) {
           setError('Database not initialized');
           setLoading(false);
           return;
        }

        const qSnap = await getDoc(doc(db, 'quizzes', quizId));
        if (!qSnap.exists()) {
          setError('Quiz not found');
          setLoading(false);
          return;
        }
        const quizData = qSnap.data() as Quiz;
        
        const qsSnap = await getDocs(query(collection(db, `quizzes/${quizId}/questions`), orderBy('order', 'asc')));
        const questionsList = qsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
        
        if (questionsList.length === 0) {
          setError('This quiz has no questions.');
          setLoading(false);
          return;
        }
        setQuestions(questionsList);

        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const sessionId = `session_${Date.now()}`;
        const sessionData = {
          id: sessionId,
          quizId,
          hostId: getFirebaseAuth().currentUser?.uid || '',
          pin,
          status: 'LOBBY',
          currentQuestionIndex: -1,
          questionStartedAt: null,
          questionEndsAt: null,
          backgroundImageUrl: quizData?.backgroundImageUrl || ''
        } as GameSession;
        
        await setDoc(doc(db, 'game_sessions', sessionId), sessionData);
        
        unsubS = onSnapshot(doc(db, 'game_sessions', sessionId), (docSnap) => {
          if (docSnap.exists()) {
            setSession(docSnap.data() as GameSession);
            setLoading(false);
          }
        });

        let playerTimeout: NodeJS.Timeout | null = null;
        unsubP = onSnapshot(collection(db, `game_sessions/${sessionId}/players`), (snap) => {
          if (playerTimeout) clearTimeout(playerTimeout);
          playerTimeout = setTimeout(() => {
            setPlayers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Player)));
          }, 250);
        });

        let responseTimeout: NodeJS.Timeout | null = null;
        unsubR = onSnapshot(collection(db, `game_sessions/${sessionId}/responses`), (snap) => {
          if (responseTimeout) clearTimeout(responseTimeout);
          responseTimeout = setTimeout(() => {
            setResponses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Response)));
          }, 250);
        });
      } catch (err: any) {
        console.error("Game Init Error:", err);
        setError(err.message || 'Failed to initialize game');
        setLoading(false);
        handleFirestoreError(err, OperationType.GET, 'game_sessions_init');
      }
    };

    init();
    return () => { unsubS(); unsubP(); unsubR(); };
  }, [quizId]);

  // Timer Effect - Optimized for precision
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (session?.status === 'QUESTION' && timeLeft > 0 && !isPaused) {
      timer = setInterval(() => {
        setTimeLeft(t => Math.max(0, t - 1));
      }, 1000);
    } else if (session?.status === 'QUESTION' && timeLeft === 0 && !isPaused) {
      console.log("Timer hit zero - revealing answer");
      updateStatus('REVEAL');
    }
    return () => clearInterval(timer);
  }, [session?.status, timeLeft, isPaused]);

  const updateStatus = async (status: SessionStatus) => {
    if (!session) {
      console.warn("Attempted to update status without session");
      return;
    }
    console.log(`Updating session status to: ${status}`);
    const updates: any = { status };
    
    if (status === 'QUESTION') {
      const nextIdx = session.currentQuestionIndex + 1;
      if (nextIdx >= questions.length) {
        console.warn("Question index out of bounds:", nextIdx);
        return;
      }
      const q = questions[nextIdx];
      if (!q) {
        console.error("Null question at index:", nextIdx);
        return;
      }
      updates.currentQuestionIndex = nextIdx;
      updates.questionStartedAt = Date.now();
      updates.questionEndsAt = Date.now() + (q.timeLimit * 1000);
      setTimeLeft(q.timeLimit);
      setIsPaused(false);
    }

    try {
      await updateDoc(doc(db, 'game_sessions', session.id), updates);
    } catch (err: any) {
      console.error("Failed to update session status:", err);
      handleFirestoreError(err, OperationType.UPDATE, `game_sessions/${session.id}`);
    }
  };

  const nextQuestion = () => {
    if (!session || questions.length === 0) return;
    const nextIdx = session.currentQuestionIndex + 1;
    console.log(`Advancing to next screen. Next index: ${nextIdx}, Total questions: ${questions.length}`);
    if (nextIdx < questions.length) {
      updateStatus('QUESTION');
    } else {
      updateStatus('FINAL');
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    }
  };

  const togglePause = async () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    if (session) {
      await updateDoc(doc(db, 'game_sessions', session.id), { isPaused: newPaused });
    }
  };

  // Memoized Leaderboard - Only re-calculates when players change significantly
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => b.score - a.score);
  }, [players]);

  const topPlayers = useMemo(() => sortedPlayers.slice(0, 5), [sortedPlayers]);
  
  // Count responses for the current question
  const responseCount = useMemo(() => {
    if (!session) return 0;
    return responses.filter(r => r.questionIndex === session.currentQuestionIndex).length;
  }, [responses, session?.currentQuestionIndex]);

  const currentQ = (session && session.currentQuestionIndex >= 0 && questions[session.currentQuestionIndex]) ? questions[session.currentQuestionIndex] : null;
  const baseUrl = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
  const joinUrl = session ? `${baseUrl}/join/${session.pin}` : '';

  if (loading) {
    return (
      <div className="fixed inset-0 bg-[#0A0A0A] z-[100] flex flex-col items-center justify-center font-sans text-white">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-[#00FF00] border-t-transparent rounded-full mb-8 shadow-[0_0_20px_rgba(0,255,0,0.5)]"
        />
        <p className="text-xl font-black uppercase italic tracking-widest text-[#00FF00] animate-pulse">ТОГЛООМЫГ БЭЛТГЭЖ БАЙНА...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="fixed inset-0 bg-[#0A0A0A] z-[100] flex flex-col items-center justify-center font-sans text-white p-6 text-center">
        <div className="bg-red-500/10 border-2 border-red-500/30 p-12 rounded-[3rem] max-w-lg shadow-[0_0_50px_rgba(239,68,68,0.1)]">
           <X size={64} className="text-red-500 mx-auto mb-8" />
           <h2 className="text-4xl font-black uppercase italic tracking-tighter mb-4 text-red-500">АЛДАА ГАРЛАА</h2>
           <p className="text-white/60 text-lg mb-12 font-medium">{error || 'Session failed to load'}</p>
           <button 
             onClick={onClose}
             className="w-full bg-white text-black py-6 rounded-2xl font-black uppercase italic tracking-tighter text-xl hover:bg-red-500 hover:text-white transition-all shadow-xl"
           >
             БУЦАХ
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0A0A0A] z-[100] flex flex-col p-4 md:p-8 overflow-y-auto overflow-x-hidden font-sans">
      <GameBackground url={session.backgroundImageUrl} />
      
      {/* Dynamic Header Rail */}
      <div className="flex justify-between items-start mb-8 relative z-50">
        <div className="flex items-start gap-8">
           <motion.div 
             initial={{ x: -50, opacity: 0 }}
             animate={{ x: 0, opacity: 1 }}
             className="bg-white/[0.03] p-5 md:p-8 rounded-[2.5rem] border-4 border-white/5 backdrop-blur-xl flex items-center gap-6 shadow-2xl"
           >
              <div className="bg-[#00FF00] text-black w-20 h-20 flex items-center justify-center rounded-[1.5rem] font-black text-5xl rotate-6 shadow-[0_12px_20px_rgba(0,255,0,0.3)] neon-glow-green">
                 {timeLeft}
              </div>
              <div className="hidden sm:block">
                 <div className="text-[10px] font-black uppercase tracking-[0.4em] text-[#00FF00] mb-2">НЭГДЭХ КОД</div>
                 <div className="text-6xl font-black italic tracking-[-0.05em] leading-none">{session.pin}</div>
              </div>
           </motion.div>

           {session.status === 'QUESTION' && (
             <motion.button 
               initial={{ scale: 0 }}
               animate={{ scale: 1 }}
               onClick={togglePause}
               className="p-8 bg-white/5 hover:bg-[#00FF00]/10 rounded-[2rem] transition-all border-4 border-white/5 active:scale-95"
             >
               {isPaused ? <PlayCircle size={40} className="text-[#00FF00]" /> : <Pause size={40} className="text-white/40" />}
             </motion.button>
           )}
        </div>

        <div className="flex items-center gap-6">
           <div className="hidden lg:flex flex-col items-end">
              <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20 mb-2">Зохион байгуулагч</div>
              <div className="text-xl font-black uppercase italic tracking-tighter text-[#00FF00]">{auth.currentUser?.displayName?.toUpperCase() || 'ADMIN_CMD'}</div>
           </div>
           <button 
             onClick={onClose} 
             className="p-6 hover:bg-[#FF4444] text-white/30 hover:text-white rounded-[1.5rem] transition-all border-4 border-white/5 bg-white/5 shadow-xl"
           >
              <X size={32} />
           </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-7xl mx-auto w-full relative z-10">
        <AnimatePresence mode="wait">
          {session.status === 'LOBBY' && (
            <motion.div 
              key="lobby"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-16 items-center">
                 <div className="lg:col-span-12 xl:col-span-8 text-center xl:text-left">
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="mb-8"
                    >
                      <h1 className="text-5xl sm:text-6xl md:text-8xl xl:text-[90px] font-black uppercase italic tracking-[-0.08em] leading-[0.85] mb-6 md:mb-8">
                        ТОГЛООМД<br />
                        <span className="text-[#00FF00]">НЭГДЭХ</span>
                      </h1>
                      <div className="flex items-center gap-4 md:gap-6 justify-center xl:justify-start">
                         <div className="bg-[#00FF00]/10 text-[#00FF00] px-4 md:px-6 py-2 rounded-full text-[10px] md:text-xs font-black uppercase tracking-[0.4em] italic border-2 border-[#00FF00]/20">
                            {players.length} тоглогч нэгдлээ
                         </div>
                         <button 
                          onClick={() => setShowQR(!showQR)}
                          className="flex items-center gap-2 md:gap-3 text-[10px] font-black uppercase tracking-[0.4em] text-white/20 hover:text-white transition-colors"
                         >
                           <QrCode size={16} /> QR код харах
                         </button>
                      </div>
                    </motion.div>

                    <div className="flex flex-wrap gap-4 justify-center xl:justify-start min-h-[120px] md:min-h-[160px]">
                      <AnimatePresence>
                        {players.map((p, i) => (
                          <motion.div 
                            key={p.id}
                            initial={{ scale: 0, rotate: -20, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 15 }}
                            className="bg-white/5 px-6 md:px-8 py-3 md:py-5 rounded-2xl md:rounded-[1.5rem] border-2 border-white/5 text-xl md:text-3xl font-black uppercase italic tracking-tighter shadow-2xl hover:bg-[#00FF00]/20 hover:border-[#00FF00]/30 transition-all cursor-default"
                          >
                            {p.name}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                 </div>

                 <div className="lg:col-span-12 xl:col-span-4 flex flex-col items-center gap-8 md:gap-12">
                     <motion.div 
                       initial={{ x: 50, opacity: 0 }}
                       animate={{ x: 0, opacity: 1 }}
                       className="bg-white p-6 md:p-10 rounded-3xl md:rounded-[3rem] shadow-2xl hover:shadow-[#00FF00]/30 transition-all border-none cursor-pointer max-w-[90vw]"
                    >
                       <div className="flex justify-center">
                          <QRCodeSVG value={joinUrl} size={180} className="md:w-[240px] md:h-[240px] lg:w-[280px] lg:h-[280px]" bgColor="#ffffff" fgColor="#000000" level="H" />
                       </div>
                       <div className="mt-6 md:mt-8 text-center border-t-2 md:border-t-4 border-black/5 pt-6 md:pt-8">
                          <div className="text-sm md:text-xl font-black text-black uppercase tracking-[0.2em] md:tracking-[0.3em] mb-1 md:mb-2">НЭГДЭХ КОД</div>
                          <div className="text-2xl md:text-3xl xl:text-4xl font-black text-black italic tracking-tighter">КОД: {session.pin}</div>
                       </div>
                    </motion.div>
                    
                    <div className="w-full px-6">
                      {players.length > 0 ? (
                        <button 
                          onClick={() => nextQuestion()}
                          className="w-full bg-[#00FF00] text-black py-8 rounded-[2.5rem] font-black text-4xl uppercase italic tracking-[-0.05em] transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_15px_30px_rgba(0,255,0,0.2)] hover:shadow-[0_20px_50px_rgba(0,255,0,0.4)] flex items-center justify-center gap-6 group"
                        >
                          ТОГЛООМЫГ ЭХЛҮҮЛЭХ <Play size={40} className="fill-current group-hover:scale-125 transition-transform" />
                        </button>
                      ) : (
                        <div className="flex flex-col items-center gap-4 text-white/10 italic">
                          <div className="animate-spin"><Zap size={48} /></div>
                          <div className="font-black uppercase tracking-[0.5em] text-xs">Бэлтгэл хангаж байна</div>
                        </div>
                      )}
                    </div>
                 </div>
              </div>
            </motion.div>
          )}

          {session.status === 'QUESTION' && currentQ && (
            <motion.div 
              key="question" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 1.05 }}
              className="w-full flex flex-col gap-8 md:gap-12"
            >
               <motion.div 
                 initial={{ y: -40, opacity: 0 }}
                 animate={{ y: 0, opacity: 1 }}
                 className="bg-white/5 p-6 md:p-8 xl:p-10 rounded-3xl md:rounded-[3rem] border-4 border-white/5 backdrop-blur-3xl relative overflow-hidden group shadow-3xl flex flex-col w-full"
               >
                  <div className="absolute -top-12 -right-12 p-4 opacity-[0.05] group-hover:opacity-10 transition-opacity rotate-12 pointer-events-none">
                    <Zap size={240} />
                  </div>
                  <div className="flex items-center gap-4 mb-6 shrink-0">
                     <div className="h-1 flex-1 bg-[#00FF00]"></div>
                     <div className="text-[#00FF00] font-black uppercase tracking-[0.5em] text-[10px] md:text-xs shrink-0">АСУУЛТ {session.currentQuestionIndex + 1} // {questions.length}</div>
                     <div className="h-1 flex-1 bg-[#00FF00]"></div>
                  </div>
                  <div className="flex-1 flex flex-col justify-center min-h-[100px] max-h-[30vh] overflow-y-auto custom-scrollbar pr-2">
                    <h2 className={`font-black italic uppercase tracking-[-0.05em] leading-[1.1] md:leading-[1.1] relative z-10 whitespace-pre-wrap text-center break-words w-full m-auto ${
                      currentQ.text.length > 150 ? 'text-lg md:text-2xl lg:text-3xl' : 
                      currentQ.text.length > 80 ? 'text-xl md:text-3xl lg:text-4xl' : 
                      currentQ.text.length > 40 ? 'text-2xl md:text-4xl lg:text-5xl' : 
                      'text-3xl md:text-5xl lg:text-6xl'
                    }`}>
                      {currentQ.text}
                    </h2>
                  </div>
               </motion.div>

               <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 md:gap-12 items-start">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 w-full">
                     {currentQ.options.map((opt, i) => (
                        <motion.div 
                           key={i} 
                           initial={{ opacity: 0, y: 20 }}
                           animate={{ opacity: 1, y: 0 }}
                           transition={{ delay: 0.2 + i * 0.1 }}
                           className="bg-white/5 p-6 sm:p-8 rounded-[2rem] border-2 border-white/5 font-black italic tracking-tight flex items-center gap-4 sm:gap-8 relative overflow-hidden shadow-xl"
                        >
                           <div className={`w-8 h-8 sm:w-12 sm:h-12 flex-shrink-0 rounded-xl sm:rounded-2xl ${['bg-[#FF4444]', 'bg-[#4444FF]', 'bg-[#FFFF44]', 'bg-[#44FF44]'][i]} shadow-[0_4px_15px_rgba(0,0,0,0.5)]`}></div>
                           <span className={`leading-[1.1] pr-4 sm:pr-8 flex-1 whitespace-pre-wrap break-words uppercase ${
                             opt.length > 50 ? 'text-xs sm:text-sm md:text-base' : 
                             opt.length > 20 ? 'text-sm sm:text-base md:text-lg' : 
                             'text-lg sm:text-xl md:text-2xl lg:text-3xl'
                           }`}>{opt}</span>
                           <div className="absolute right-0 top-0 bottom-0 w-2 opacity-20" style={{ backgroundColor: ['#FF4444', '#4444FF', '#FFFF44', '#44FF44'][i] }}></div>
                        </motion.div>
                     ))}
                  </div>

                  <div className="flex flex-col xl:flex-row items-center gap-8 w-full justify-center">
                    {(currentQ as any).imageUrl ? (
                      <motion.div 
                        initial={{ rotate: 2, scale: 0.9 }}
                        animate={{ rotate: -1, scale: 1 }}
                        className="w-full xl:w-1/2 max-w-sm aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-2xl"
                      >
                         <img src={(currentQ as any).imageUrl} alt="Combat Intel" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </motion.div>
                    ) : null}

                    <div className="flex flex-col gap-6 w-full xl:w-1/2 max-w-sm">
                      <div className="grid grid-cols-2 gap-6 w-full">
                         <div className="text-center group bg-white/5 rounded-3xl p-4 border border-white/5">
                            <motion.div 
                              key={responseCount}
                              initial={{ scale: 1.5, color: '#00FF00' }}
                              animate={{ scale: 1, color: '#FFFFFF' }}
                              className="text-4xl md:text-6xl font-black italic tracking-tighter leading-none"
                            >
                              {responseCount}
                            </motion.div>
                            <div className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-[#00FF00] mt-2">Хариулт</div>
                         </div>
                         <div className="text-center bg-white/5 rounded-3xl p-4 border border-white/5">
                            <div className="text-4xl md:text-6xl font-black italic tracking-tighter leading-none text-white/50">
                              {players.length}
                            </div>
                            <div className="text-[10px] sm:text-xs font-black uppercase tracking-[0.3em] text-white/30 mt-2">Тоглогч</div>
                         </div>
                      </div>

                      {/* Live Leaderboard */}
                      <div className="w-full bg-white/[0.02] rounded-3xl border border-white/5 p-4 md:p-6 shadow-2xl relative overflow-hidden">
                         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00FF00]/50 to-transparent"></div>
                         <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/30 mb-4 text-center">ШУУД ЧАНСАА (ТОП 5)</div>
                         <div className="space-y-2">
                            {[...players]
                              .sort((a, b) => b.score - a.score)
                              .slice(0, 5)
                              .map((p, i) => (
                                <motion.div 
                                  key={p.uid} 
                                  layout 
                                  className="flex items-center justify-between p-2 sm:p-3 bg-white/5 rounded-2xl border border-white/5"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-[0.6rem] flex items-center justify-center text-xs sm:text-sm font-black
                                      ${i === 0 ? 'bg-[#FFFF44] text-black shadow-[0_0_15px_rgba(255,255,68,0.3)]' : 
                                        i === 1 ? 'bg-gray-300 text-black shadow-[0_0_15px_rgba(209,213,219,0.3)]' : 
                                        i === 2 ? 'bg-[#CD7F32] text-white shadow-[0_0_15px_rgba(205,127,50,0.3)]' : 
                                        'bg-white/10 text-white/50'}
                                    `}>
                                      {i + 1}
                                    </div>
                                    <div className="font-black italic text-xs sm:text-sm leading-tight truncate max-w-[100px] sm:max-w-[150px] uppercase">{p.name}</div>
                                  </div>
                                  <div className="font-black italic tracking-tighter text-[#00FF00] text-sm sm:text-base">{p.score}</div>
                                </motion.div>
                            ))}
                            {players.length === 0 && (
                              <div className="text-center text-white/20 italic text-sm py-4">Тоглогч алга байна</div>
                            )}
                         </div>
                      </div>
                    </div>
                  </div>
               </div>
            </motion.div>
          )}

          {session.status === 'REVEAL' && currentQ && (
            <motion.div 
              key="reveal" 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full text-center max-w-4xl"
            >
              <div className="mb-12">
                 <div className="text-[10px] font-black uppercase tracking-[0.5em] text-[#00FF00] mb-6">Даалгавар дууслаа</div>
                 <h3 className="text-3xl font-black uppercase italic tracking-widest text-white/30">Зөв хариулт:</h3>
              </div>

              <motion.div 
                initial={{ y: 50 }}
                animate={{ y: 0 }}
                className="bg-[#00FF00] text-black py-12 px-6 md:py-20 md:px-12 rounded-[3rem] md:rounded-[5rem] font-black uppercase italic tracking-tight leading-[1] mb-16 shadow-2xl shadow-[#00FF00]/20 border-none relative overflow-hidden flex flex-col justify-center min-h-[250px] md:min-h-[350px]"
              >
                <div className={`relative z-10 whitespace-pre-wrap break-words w-full ${
                  currentQ.options[currentQ.correctIndex].length > 50 ? 'text-2xl sm:text-3xl md:text-4xl' :
                  currentQ.options[currentQ.correctIndex].length > 20 ? 'text-3xl sm:text-4xl md:text-5xl lg:text-6xl' :
                  'text-4xl sm:text-5xl md:text-[6vw]'
                }`}>{currentQ.options[currentQ.correctIndex]}</div>
                <div className="absolute inset-y-0 right-0 flex items-center p-8 opacity-10 pointer-events-none"><CheckCircle2 className="w-[120px] h-[120px] md:w-[200px] md:h-[200px]" /></div>
              </motion.div>
              
              <div className="flex flex-wrap justify-center gap-4 mb-24">
                 <AnimatePresence>
                   {responses.filter(r => r.questionIndex === session.currentQuestionIndex && r.isCorrect).slice(0, 10).map((r, i) => (
                      <motion.div 
                        key={i} 
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="text-xs font-black uppercase tracking-widest px-4 py-2 bg-white/5 rounded-full border border-white/10 text-white/60"
                      >
                        {players.find(p => p.id === r.uid)?.name}
                      </motion.div>
                   ))}
                 </AnimatePresence>
                 {responses.filter(r => r.questionIndex === session.currentQuestionIndex && r.isCorrect).length > 10 && (
                   <div className="text-xs font-black uppercase tracking-widest px-4 py-2 text-white/20">
                     + {responses.filter(r => r.questionIndex === session.currentQuestionIndex && r.isCorrect).length - 10} БУСАД
                   </div>
                 )}
              </div>

              <button 
                onClick={() => updateStatus('LEADERBOARD')}
                className="group bg-white text-black px-16 py-8 rounded-[2.5rem] font-black text-3xl uppercase italic tracking-[-0.05em] flex items-center gap-6 mx-auto shadow-[0_15px_30px_rgba(255,255,255,0.1)] hover:scale-105 active:scale-95 transition-all"
              >
                ЧАНСААГ ХАРАХ <ChevronRight size={40} className="group-hover:translate-x-2 transition-transform" />
              </button>
            </motion.div>
          )}

          {session.status === 'LEADERBOARD' && (
            <motion.div 
              key="leaderboard" 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-4xl"
            >
              <div className="bg-white/[0.03] p-12 md:p-16 rounded-[4rem] border-4 border-white/5 backdrop-blur-3xl shadow-3xl">
                <div className="flex items-center justify-between mb-16">
                  <h2 className="text-5xl font-black italic uppercase tracking-[-0.05em] flex items-center gap-4">
                    <Trophy className="text-[#FFFF44]" size={48} /> ЧАНСААНЫ ХҮСНЭГТ
                  </h2>
                  <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20">Үе {session.currentQuestionIndex + 1} // Синх</div>
                </div>

                 <div className="space-y-4 max-w-full overflow-hidden">
                  {topPlayers.map((p, i) => (
                    <motion.div 
                      key={p.id}
                      initial={{ opacity: 0, x: -50 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className={`flex flex-col sm:flex-row items-center sm:justify-between p-6 sm:p-8 gap-4 rounded-[2rem] border-4 transition-all overflow-hidden ${i === 0 ? 'bg-[#00FF00] text-black border-[#00FF00] shadow-[0_20px_40px_rgba(0,255,0,0.2)]' : 'bg-white/5 border-white/5'}`}
                    >
                      <div className="flex items-center gap-4 sm:gap-8 w-full sm:w-auto">
                        <span className={`font-black text-4xl sm:text-5xl italic ${i === 0 ? 'opacity-100' : 'opacity-20'}`}>0{i + 1}</span>
                        <div className="flex flex-col min-w-0 flex-1">
                           <span className="font-black text-2xl sm:text-4xl uppercase italic tracking-[-0.05em] leading-none mb-1 truncate">{p.name}</span>
                           <div className={`text-[10px] font-black uppercase tracking-[0.3em] ${i === 0 ? 'text-black/40' : 'text-white/20'}`}>Тоглогчийн нэр</div>
                        </div>
                        {i === 0 && <Zap size={24} className="fill-current ml-2 animate-pulse sm:w-[32px]" />}
                      </div>
                      <div className="text-center sm:text-right w-full sm:w-auto border-t sm:border-t-0 pt-4 sm:pt-0 mt-2 sm:mt-0 border-current/20">
                         <div className="text-4xl sm:text-5xl font-black tracking-[-0.05em] leading-none mb-1 sm:mb-2">{p.score}</div>
                         <div className={`text-[10px] font-black uppercase tracking-[0.2em] ${i === 0 ? 'text-black/40' : 'text-white/20'}`}>Нийт оноо</div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <button 
                  onClick={() => nextQuestion()}
                  className="mt-16 w-full bg-[#00FF00] text-black py-8 rounded-[2.5rem] font-black text-3xl uppercase italic tracking-[-0.05em] transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_15px_30px_rgba(0,255,0,0.2)] hover:shadow-[0_20px_50px_rgba(0,255,0,0.4)] flex items-center justify-center gap-6"
                >
                  ДАРААГИЙН АСУУЛТ <ChevronRight size={40} />
                </button>
              </div>
            </motion.div>
          )}

          {session.status === 'FINAL' && (
            <motion.div 
              key="final" 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center w-full max-w-5xl"
            >
              <div className="relative mb-8 md:mb-16">
                 <motion.div 
                   animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                   transition={{ duration: 3, repeat: Infinity }}
                   className="absolute inset-0 bg-[#00FF00] blur-[150px] rounded-full -z-10"
                 ></motion.div>
                 <Trophy size={100} className="text-[#FFFF44] mx-auto mb-6 md:mb-8 drop-shadow-[0_0_50px_#FFFF44]" />
                 <h1 className="text-[20vw] md:text-[200px] font-black uppercase italic tracking-[-0.1em] leading-none opacity-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 select-none">ТОГЛООМ</h1>
                 <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tight text-white mb-8">ШИЛДЭГ 5 ТОГЛОГЧ</h2>
              </div>
              
              <div className="space-y-4 md:space-y-6 w-full max-w-4xl mx-auto px-4 md:px-0">
                {[...players].sort((a, b) => b.score - a.score).slice(0, 5).map((p, index) => (
                  <motion.div 
                    key={p.uid}
                    initial={{ x: -50, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className={`flex items-center justify-between p-6 md:p-8 rounded-[2rem] border-4 ${
                      index === 0 
                        ? 'bg-[#00FF00] text-black border-[#00FF00] shadow-[0_10px_30px_rgba(0,255,0,0.3)]' 
                        : index === 1
                        ? 'bg-white/10 text-white border-white/20'
                        : index === 2
                        ? 'bg-[#CD7F32]/20 text-[#CD7F32] border-[#CD7F32]/30'
                        : 'bg-white/5 text-white/60 border-white/5'
                    }`}
                  >
                     <div className="flex items-center gap-6">
                        <div className={`w-12 h-12 md:w-16 md:h-16 flex items-center justify-center font-black text-2xl md:text-4xl rounded-2xl ${
                           index === 0 ? 'bg-black text-[#00FF00]' : 'bg-white/10'
                        }`}>
                           {index + 1}
                        </div>
                        <div className="text-left flex flex-col">
                           <span className="font-black uppercase italic tracking-[-0.05em] text-2xl md:text-4xl leading-none truncate max-w-[40vw]">{p.name}</span>
                        </div>
                     </div>
                     <div className="text-right">
                        <div className="font-black italic tracking-tighter text-3xl md:text-5xl leading-none">{p.score}</div>
                        <div className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] opacity-40">ОНОО</div>
                     </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-20">
                 <button 
                  onClick={onClose} 
                  className="group inline-flex items-center gap-4 text-white/20 hover:text-white font-black uppercase italic text-2xl tracking-[0.2em] transition-all"
                 >
                   ТОГЛООМЫГ ДУУСГАХ <X className="group-hover:rotate-90 transition-transform" />
                 </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
