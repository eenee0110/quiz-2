/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  increment,
  orderBy
} from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { KeyRound, User, ChevronRight, CheckCircle2, XCircle, Send, Trophy, Zap, Clock, Pause, Star, Target, Shield, Heart, X } from 'lucide-react';
import { GameSession, Player, Question, SessionStatus } from '../types';
import GameBackground from './GameBackground';

interface PlayerGameProps {
  onClose: () => void;
}

const SHAPES = [
  { icon: <Star className="fill-current" />, color: 'bg-[#FF4444]', border: 'border-[#CC3333]' },
  { icon: <Shield className="fill-current" />, color: 'bg-[#4444FF]', border: 'border-[#3333CC]' },
  { icon: <Target className="fill-current" />, color: 'bg-[#FFFF44]', border: 'border-[#CCCC33]' },
  { icon: <Heart className="fill-current" />, color: 'bg-[#44FF44]', border: 'border-[#33CC33]' },
];

export default function PlayerGame({ onClose }: PlayerGameProps) {
  const { initialPin } = useParams();
  const [step, setStep] = useState<'JOIN' | 'NAME' | 'PLAYING'>(() => {
    const savedPin = localStorage.getItem('quiz_pin');
    if (initialPin && savedPin !== initialPin) return 'JOIN';
    const saved = localStorage.getItem('quiz_step');
    return (saved as any) || 'JOIN';
  });
  const [pin, setPin] = useState(() => {
    const savedPin = localStorage.getItem('quiz_pin');
    if (initialPin && savedPin !== initialPin) return initialPin;
    return savedPin || initialPin || '';
  });
  const [name, setName] = useState(() => localStorage.getItem('quiz_name') || '');
  const [error, setError] = useState('');
  const [session, setSession] = useState<GameSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const questionsRef = useRef<Question[]>([]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [revealTimeoutFinished, setRevealTimeoutFinished] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const controls = useAnimation();
  const currentIndexRef = useRef(-1);

  // Helper to get or create a stable player ID
  const getPlayerId = () => {
    let id = localStorage.getItem('player_uid');
    if (!id) {
       id = typeof crypto !== 'undefined' && crypto.randomUUID 
              ? crypto.randomUUID() 
              : 'player_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
       localStorage.setItem('player_uid', id);
    }
    return id;
  };

  // Persist State Changes
  useEffect(() => {
    localStorage.setItem('quiz_step', step);
    localStorage.setItem('quiz_pin', pin);
    localStorage.setItem('quiz_name', name);
  }, [step, pin, name]);

  // Handle initialization/recovery
  useEffect(() => {
    if (step === 'PLAYING' && pin && name) {
      findSession(pin).then(s => {
        if (s) joinGame(s);
      });
    } else if (initialPin && initialPin.length === 6) {
      findSession(initialPin);
    }
  }, []);

  const findSession = async (searchPin = pin) => {
    if (searchPin.length !== 6) return null;
    setError('');
    setLoading(true);
    try {
      const q = query(collection(db, 'game_sessions'), where('pin', '==', searchPin), where('status', 'in', ['LOBBY', 'QUESTION', 'REVEAL', 'LEADERBOARD']));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setError('Өрөө олдсонгүй эсвэл тоглоом дууссан байна.');
        if (step === 'PLAYING') setStep('JOIN');
        setLoading(false);
        return null;
      }

      const sData = { id: snap.docs[0].id, ...snap.docs[0].data() } as GameSession;
      setSession(sData);

      try {
        const qSnap = await getDocs(query(collection(db, `quizzes/${sData.quizId}/questions`), orderBy('order', 'asc')));
        const qs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
        setQuestions(qs);
        questionsRef.current = qs;
      } catch (err) {
        console.error("Failed to prefetch questions:", err);
      }
      
      const savedName = localStorage.getItem('quiz_name');
      if (step === 'JOIN') {
        if (savedName) {
          // Wrap in a promise to avoid race conditions with setSession
          setTimeout(() => {
            handleAutoJoin(sData, savedName);
          }, 0);
        } else {
          setStep('NAME');
        }
      }
      
      setLoading(false);
      return sData;
    } catch (err) {
      console.error("Find Session Error:", err);
      setError('Холболтын алдаа. Дахин оролдоно уу.');
      setLoading(false);
      return null;
    }
  };

  const handleAutoJoin = async (targetSession: GameSession, playerName: string) => {
    setLoading(true);
    try {
      const uid = getPlayerId();
      const sessionPlayersRef = collection(db, `game_sessions/${targetSession.id}/players`);
      const playerRef = doc(db, `game_sessions/${targetSession.id}/players`, uid);
      
      const existingSnap = await getDocs(query(sessionPlayersRef, where('uid', '==', uid)));
      
      if (existingSnap.empty) {
        const pData: Player = {
          id: uid,
          uid,
          name: playerName.trim().toUpperCase(),
          score: 0,
          lastCorrect: false,
          streak: 0
        };
        await setDoc(playerRef, pData);
        setPlayer(pData);
      } else {
        setPlayer(existingSnap.docs[0].data() as Player);
      }
      
      setStep('PLAYING');
      setError('');
    } catch (err: any) {
       console.error("Join failed", err);
       setError('Холболтын алдаа: ' + (err.message || 'Тодорхойгүй алдаа'));
       setStep('NAME');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinClick = () => joinGame(session);

  const joinGame = async (targetSession: GameSession | null = session) => {
    if (!name || !targetSession || !targetSession.id) return;
    setLoading(true);
    try {
      const uid = getPlayerId();
      
      const sessionPlayersRef = collection(db, `game_sessions/${targetSession.id}/players`);
      const playerRef = doc(db, `game_sessions/${targetSession.id}/players`, uid);
      
      // Check if player already exists (reconnect case)
      const existingSnap = await getDocs(query(sessionPlayersRef, where('uid', '==', uid)));
      
      if (existingSnap.empty) {
        const pData: Player = {
          id: uid,
          uid,
          name: name.trim().toUpperCase(),
          score: 0,
          lastCorrect: false,
          streak: 0
        };
        await setDoc(playerRef, pData);
        setPlayer(pData);
      } else {
        setPlayer(existingSnap.docs[0].data() as Player);
      }
      
      setStep('PLAYING');
    } catch (err: any) {
       console.error("Join failed", err);
       setError('Холболтын алдаа: ' + (err.message || 'Тодорхойгүй алдаа'));
       if (step === 'PLAYING') setStep('NAME');
    } finally {
       setLoading(false);
    }
  };

  const disconnect = () => {
    localStorage.removeItem('quiz_step');
    localStorage.removeItem('quiz_pin');
    localStorage.removeItem('quiz_name');
    onClose();
  };

  // Centralized Listeners with Cleanup
  useEffect(() => {
    if (step !== 'PLAYING' || !session?.id) return;

    let isQuestionStatus = false;
    let latestPlayersData: any[] = [];
    
    const unsubSession = onSnapshot(doc(db, 'game_sessions', session.id), async (docSnap) => {
      if (!docSnap.exists()) {
        console.warn("Session doc deleted unexpectedly:", session.id);
        return;
      }
      const sData = docSnap.data() as GameSession;
      
      const wasQuestion = isQuestionStatus;
      isQuestionStatus = sData.status === 'QUESTION';
      
      // If we just finished a question, apply the latest player data we collected
      if (wasQuestion && !isQuestionStatus && latestPlayersData.length > 0) {
          setAllPlayers(latestPlayersData.map(d => ({ id: d.id, ...d.data() } as Player)));
      }
      
      console.log(`Session status update: ${sData.status}, Index: ${sData.currentQuestionIndex}`);
      setSession(prev => ({ ...prev, ...sData }));
      setIsPaused(sData.status === 'QUESTION' && sData.currentQuestionIndex >= 0 && (sData as any).isPaused);

      if (sData.status === 'QUESTION' && sData.currentQuestionIndex !== currentIndexRef.current && sData.currentQuestionIndex >= 0) {
         console.log("New question detected, applying instantly...");
         currentIndexRef.current = sData.currentQuestionIndex;
         
         const qs = questionsRef.current;
         if (qs[sData.currentQuestionIndex]) {
           setCurrentQuestion(qs[sData.currentQuestionIndex]);
           setHasAnswered(false);
           setIsCorrect(null);
         } else {
           // Fallback if not prefetched
           try {
             const qSnap = await getDocs(query(collection(db, `quizzes/${sData.quizId}/questions`), orderBy('order', 'asc')));
             const fetchedQs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
             setQuestions(fetchedQs);
             questionsRef.current = fetchedQs;
             if (fetchedQs[sData.currentQuestionIndex]) {
               setCurrentQuestion(fetchedQs[sData.currentQuestionIndex]);
               setHasAnswered(false);
               setIsCorrect(null);
             }
           } catch (err) {
             console.error("Failed to fetch questions fallback:", err);
           }
         }
      }
    });

    let playerTimeout: NodeJS.Timeout | null = null;
    const unsubPlayers = onSnapshot(collection(db, `game_sessions/${session.id}/players`), (snap) => {
      latestPlayersData = snap.docs;
      
      if (!isQuestionStatus) {
         if (playerTimeout) clearTimeout(playerTimeout);
         playerTimeout = setTimeout(() => {
           setAllPlayers(latestPlayersData.map(d => ({ id: d.id, ...d.data() } as Player)));
         }, 300);
      }
    });

    const uid = getPlayerId();
    const unsubPlayer = onSnapshot(doc(db, `game_sessions/${session.id}/players`, uid), (docSnap) => {
      if (docSnap.exists()) setPlayer(docSnap.data() as Player);
    });

    return () => {
      unsubSession();
      unsubPlayers();
      unsubPlayer();
    };
  }, [step, session?.id]);

  useEffect(() => {
    if (session?.status === 'REVEAL') {
      setRevealTimeoutFinished(false);
      const timer = setTimeout(() => {
        setRevealTimeoutFinished(true);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setRevealTimeoutFinished(false);
    }
  }, [session?.status]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitChoice = async (choiceIndex: number) => {
    if (hasAnswered || isSubmitting || !session || !currentQuestion || !player || isPaused) return;
    
    setIsSubmitting(true);
    setHasAnswered(true);

    const correct = choiceIndex === currentQuestion.correctIndex;
    const timeLimitMs = currentQuestion.timeLimit * 1000;
    const startTime = session.questionStartedAt || Date.now();
    const timeTaken = Date.now() - startTime;
    
    let score = 0;
    if (correct) {
      // Base score 1000. Decays to 500 at the very last second.
      const progress = Math.min(1, Math.max(0, timeTaken / timeLimitMs));
      score = Math.floor(1000 * (1 - (progress / 2)));
    }

    setPointsEarned(score);
    setIsCorrect(correct);

    try {
      const respId = `${session.currentQuestionIndex}_${player.uid}`;
      await setDoc(doc(db, `game_sessions/${session.id}/responses`, respId), {
        uid: player.uid,
        questionIndex: session.currentQuestionIndex,
        choice: choiceIndex,
        isCorrect: correct,
        score: score,
        timestamp: serverTimestamp()
      });

      await updateDoc(doc(db, `game_sessions/${session.id}/players`, player.uid), {
        score: increment(score),
        lastCorrect: correct,
        streak: correct ? increment(1) : 0,
        lastResponseTime: timeTaken
      });
    } catch (err) {
      console.error("Submit failed", err);
      // Revert local state on failure to allow retry if possible, 
      // though usually network failures at this stage are fatal for the current question
      setHasAnswered(false);
      setIsSubmitting(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const myRank = useMemo(() => {
    if (!player || allPlayers.length === 0) return 0;
    const sorted = [...allPlayers].sort((a, b) => b.score - a.score);
    return sorted.findIndex(p => p.uid === player.uid) + 1;
  }, [allPlayers, player]);

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-start md:justify-center p-6 pb-24 md:pb-8 bg-[#0A0A0A] relative font-sans">
      <GameBackground url={session?.backgroundImageUrl} />

      {loading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="w-12 h-12 border-4 border-[#00FF00] border-t-transparent rounded-full mb-4 shadow-[0_0_20px_rgba(0,255,0,0.5)]"
            />
            <p className="text-[#00FF00] font-black uppercase italic tracking-widest animate-pulse">ТҮР ХҮЛЭЭНЭ ҮҮ...</p>
        </div>
      )}
      
      <AnimatePresence mode="wait">
        {step === 'JOIN' && (
          <motion.div 
            key="join"
            initial={{ opacity: 0, scale: 0.9, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="w-full max-w-sm text-center z-10"
          >
            <motion.div 
              initial={{ rotate: -10 }}
              animate={{ rotate: 10 }}
              transition={{ duration: 3, repeat: Infinity, repeatType: "mirror" }}
              className="bg-[#00FF00] text-black p-8 rounded-[2.5rem] w-fit mx-auto mb-12 shadow-[0_20px_50px_rgba(0,255,0,0.3)] neon-glow-green"
            >
              <KeyRound size={64} />
            </motion.div>
            <h2 className="text-6xl font-black uppercase italic tracking-[-0.05em] mb-12 leading-none">
              НЭГДЭХ <span className="text-[#00FF00]">КОД</span>
            </h2>
            <div className="space-y-8">
              <input 
                type="text" 
                maxLength={6}
                inputMode="numeric"
                placeholder="000000"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full bg-white/[0.03] text-white rounded-[2rem] p-10 text-center text-6xl font-black outline-none border-4 border-white/5 focus:border-[#00FF00] focus:bg-[#00FF00]/5 transition-all tracking-[0.2em] shadow-2xl"
              />
              {error && (
                <motion.p initial={{ x: -10 }} animate={{ x: 0 }} className="text-[#FF4444] text-xs font-black uppercase tracking-[0.3em] italic">
                  {error}
                </motion.p>
              )}
              <button 
                onClick={() => findSession()}
                disabled={pin.length !== 6}
                className="w-full bg-white text-black py-8 rounded-[2rem] font-black text-4xl uppercase italic tracking-[-0.05em] transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-20 shadow-[0_15px_30px_rgba(255,255,255,0.1)] hover:shadow-[0_20px_50px_rgba(255,255,255,0.3)] bg-gradient-to-r from-white to-[#EEE]"
              >
                ТОГЛООМД НЭГДЭХ
              </button>
              <button onClick={disconnect} className="text-white/10 font-black uppercase tracking-[0.5em] text-[10px] hover:text-white transition-colors">Буцах</button>
            </div>
          </motion.div>
        )}

        {step === 'NAME' && (
          <motion.div 
            key="name"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="w-full max-w-sm text-center z-10"
          >
            <div className="bg-[#00FF00] text-black p-8 rounded-[2.5rem] w-fit mx-auto mb-12 shadow-[0_20px_50px_rgba(0,255,0,0.3)]">
              <User size={64} />
            </div>
            <h2 className="text-6xl font-black uppercase italic tracking-[-0.05em] mb-4">ТАНЫ НЭР</h2>
            <div className="text-[#00FF00] font-black uppercase tracking-[0.5em] text-[10px] mb-12">ӨӨРИЙН НЭРИЙГ БИЧНЭ ҮҮ</div>
            <div className="space-y-6 flex flex-col items-center">
              <input 
                type="text" 
                maxLength={15}
                placeholder="Нэрээ оруулна уу..."
                autoFocus
                value={name}
                onChange={e => setName(e.target.value.toUpperCase())}
                className="w-full max-w-sm bg-white/[0.03] text-white rounded-3xl p-6 text-center text-2xl md:text-3xl font-black outline-none border-4 border-white/5 focus:border-[#00FF00] transition-all"
              />
              <button 
                onClick={handleJoinClick}
                disabled={!name.trim()}
                className="w-full max-w-sm bg-[#00FF00] text-black py-6 rounded-3xl font-black text-2xl md:text-3xl uppercase italic tracking-[-0.05em] transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_15px_30px_rgba(0,255,0,0.2)] disabled:opacity-50"
              >
                ХАДГАЛАХ
              </button>
            </div>
          </motion.div>
        )}

        {step === 'PLAYING' && session && (
           <motion.div key="playing" className="w-full max-w-md z-10 flex-1 flex flex-col justify-center">
             {session.status === 'LOBBY' && (
                <div className="text-center">
                   <motion.div 
                     initial={{ rotate: -5, scale: 0.9 }}
                     animate={{ rotate: 5, scale: 1 }}
                     transition={{ duration: 2, repeat: Infinity, repeatType: "mirror" }}
                     className="bg-white/[0.01] p-8 md:p-16 rounded-[3rem] md:rounded-[4rem] border-4 border-dashed border-white/5 mb-8 md:mb-16 relative overflow-hidden w-full max-w-sm mx-auto"
                   >
                      <div className="absolute inset-0 bg-grid opacity-10"></div>
                      <Zap size={80} className="text-[#00FF00] mx-auto mb-8 animate-pulse drop-shadow-[0_0_20px_rgba(0,255,0,0.5)] md:w-[100px] md:h-[100px]" />
                      <h3 className="text-3xl sm:text-4xl md:text-6xl font-black uppercase italic tracking-[-0.05em] mb-4 md:mb-6 leading-[0.8] px-2 break-words max-w-[90vw] mx-auto">БЭЛЭН<br/><span className="text-[#00FF00]">БАЙГААРАЙ</span></h3>
                      <div className="text-white/20 font-black uppercase tracking-[0.4em] text-[8px] md:text-[10px]">Зохион байгуулагчийг хүлээж байна</div>
                   </motion.div>
                   <div className="text-white/[0.015] font-black text-6xl md:text-9xl uppercase italic tracking-tighter select-none whitespace-nowrap overflow-hidden text-ellipsis absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 leading-none w-full px-4 text-center">
                     {name}
                   </div>
                </div>
             )}

             {session.status === 'QUESTION' && currentQuestion && (
               <div className="flex-1 w-full flex flex-col pt-2 pb-6">
                  <AnimatePresence>
                    {isPaused && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-[-40px] bg-black/95 backdrop-blur-3xl z-[60] flex flex-col items-center justify-center rounded-[4rem] border-4 border-[#00FF00]/20 p-12 text-center"
                      >
                         <Pause size={100} className="text-[#00FF00] animate-pulse mb-8" />
                         <h3 className="text-3xl sm:text-5xl md:text-6xl font-black uppercase italic tracking-[-0.05em] leading-[0.85] mb-6 px-2 break-words max-w-[90vw] mx-auto">ТОГЛООМ<br/><span className="text-[#00FF00]">ТҮР ЗОГСЛОО</span></h3>
                         <p className="text-white/30 font-black uppercase tracking-[0.4em] text-xs">Удахгүй үргэлжилнэ</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!hasAnswered ? (
                    <div className="flex flex-col w-full h-full">
                       <div className="text-center shrink-0 flex flex-col mb-4">
                          <div className="text-[#00FF00] font-black uppercase tracking-[0.6em] text-[10px] mb-2 shrink-0">Асуулт ирлээ</div>
                          <div className="px-4 mb-4 break-words flex flex-col justify-center max-h-[25vh] overflow-y-auto custom-scrollbar">
                             <h2 className={`font-black italic tracking-tighter leading-tight whitespace-pre-wrap ${
                               currentQuestion.text.length > 150 ? 'text-base md:text-lg' : 
                               currentQuestion.text.length > 80 ? 'text-lg md:text-xl' : 
                               currentQuestion.text.length > 40 ? 'text-xl md:text-2xl' : 
                               'text-2xl md:text-3xl'
                             }`}>{currentQuestion.text}</h2>
                          </div>
                          <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5 p-[2px] shrink-0">
                             <motion.div 
                               key={session?.currentQuestionIndex}
                               initial={{ width: `${session && (session as any).questionStartedAt ? Math.max(0, Math.min(100, 100 - ((Date.now() - (session as any).questionStartedAt) / (currentQuestion.timeLimit * 1000)) * 100)) : 100}%` }}
                               animate={{ width: "0%" }}
                               transition={{ duration: session && (session as any).questionStartedAt ? Math.max(0, currentQuestion.timeLimit - ((Date.now() - (session as any).questionStartedAt) / 1000)) : currentQuestion.timeLimit, ease: "linear" }}
                               className="h-full bg-[#00FF00] rounded-full shadow-[0_0_10px_#00FF00]"
                             />
                          </div>
                       </div>
                       
                       <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 pb-4">
                         <div className="flex flex-col gap-3 w-full pb-8">
                           {currentQuestion.options.map((opt, i) => (
                             <motion.button
                                key={i}
                                whileTap={{ scale: 0.92 }}
                                onClick={() => submitChoice(i)}
                                className={`p-4 sm:p-6 lg:p-8 rounded-2xl lg:rounded-[2rem] flex items-center justify-between border-2 sm:border-4 border-black transition-all ${SHAPES[i].color} text-black relative overflow-hidden group shadow-[0_6px_0_0_rgba(0,0,0,1)] lg:shadow-[0_8px_0_0_rgba(0,0,0,1)] active:shadow-none translate-y-0 active:translate-y-1 lg:active:translate-y-2 shrink-0`}
                             >
                                <div className="flex items-center gap-3 sm:gap-6 relative z-10 w-full overflow-hidden">
                                   <div className="flex-shrink-0 opacity-20 group-hover:scale-125 transition-transform w-[24px] h-[24px] sm:w-[32px] sm:h-[32px] lg:w-[40px] lg:h-[40px] flex items-center justify-center">
                                      {SHAPES[i].icon}
                                   </div>
                                   <div className="text-left flex-1 min-w-0 flex items-center">
                                      <span className="text-base sm:text-xl lg:text-3xl font-black italic tracking-[-0.05em] leading-[1] uppercase whitespace-normal break-words inline-block w-full">{opt}</span>
                                   </div>
                                </div>
                             </motion.button>
                           ))}
                         </div>
                       </div>
                    </div>
                  ) : (
                    <div className="text-center py-32 bg-white/[0.02] rounded-[5rem] border-4 border-dashed border-white/10 flex flex-col items-center shadow-3xl">
                       <div className="relative mb-12">
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                            className="bg-gradient-to-r from-[#00FF00] to-transparent p-12 rounded-full opacity-20"
                          >
                             <Zap size={100} />
                          </motion.div>
                          <div className="absolute inset-0 flex items-center justify-center">
                             <Send size={64} className="text-[#00FF00] drop-shadow-[0_0_15px_#00FF00]" />
                          </div>
                       </div>
                       <h3 className="text-3xl sm:text-4xl md:text-6xl font-black uppercase italic tracking-[-0.05em] leading-[0.8] mb-6 px-2 break-words w-full">ХАРИУЛТ<br/><span className="text-[#00FF00]">ИЛГЭЭГДЛЭЭ</span></h3>
                       <div className="text-white/20 font-black uppercase tracking-[0.4em] text-[10px]">Хариуг хүлээж байна</div>
                    </div>
                  )}
               </div>
             )}

             {session.status === 'REVEAL' && (
                revealTimeoutFinished ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center w-full px-2 flex flex-col items-center justify-center min-h-[50vh]">
                     <div className="text-[#00FF00] font-black uppercase tracking-[0.6em] text-[10px] mb-8 shrink-0 italic">Цааш үргэлжлэхийг хүлээж байна</div>
                     <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                        className="mb-8 opacity-20"
                     >
                        <Zap size={64} className="text-[#00FF00]" />
                     </motion.div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center w-full px-2">
                    <div className={`p-8 md:p-16 rounded-[3rem] shadow-2xl border-2 border-black/20 ${isCorrect ? 'bg-[#00FF00] text-black shadow-[#00FF00]/30' : 'bg-[#FF4444] text-white shadow-[#FF4444]/30'}`}>
                       <motion.div
                         initial={{ y: 20 }}
                         animate={{ y: 0 }}
                         className="mb-8 md:mb-12"
                       >
                         {isCorrect ? <CheckCircle2 size={120} className="mx-auto md:w-[160px] md:h-[160px]" strokeWidth={3} /> : <XCircle size={120} className="mx-auto md:w-[160px] md:h-[160px]" strokeWidth={3} />}
                       </motion.div>
                       <h2 className="text-5xl md:text-8xl font-black italic uppercase tracking-[-0.08em] leading-none mb-8 md:mb-12 break-words max-w-[90vw] mx-auto">{isCorrect ? 'ЗӨВ!' : 'БУРУУ!'}</h2>
                       
                       {!isCorrect && currentQuestion && (
                          <div className="mb-8 md:mb-12 flex flex-col items-center bg-black/10 py-4 px-6 rounded-3xl border border-current/20">
                             <div className="text-[10px] font-black uppercase tracking-[0.6em] opacity-60 mb-2">ЗӨВ ХАРИУЛТ:</div>
                             <div className="text-xl sm:text-2xl font-black italic uppercase tracking-[-0.05em] leading-tight break-words max-w-[80vw] mx-auto opacity-90">{currentQuestion.options[currentQuestion.correctIndex]}</div>
                          </div>
                       )}

                       <div className="flex flex-col items-center pt-8 md:pt-12 border-t-8 border-current/10">
                          <div className="text-[10px] font-black uppercase tracking-[0.6em] opacity-40 mb-2 md:mb-4">ОНОО:</div>
                          <div className="text-5xl md:text-7xl font-black italic tracking-tighter leading-none">+{pointsEarned} <span className="text-lg md:text-xl">ОНОО</span></div>
                       </div>
                    </div>
                    
                    {player && (
                      <div className="mt-16 grid grid-cols-2 gap-6">
                         <div className="bg-white/5 p-8 rounded-[2.5rem] border-4 border-white/5">
                            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20 mb-4 italic">ДАРААЛСАН</div>
                            <div className="text-5xl font-black italic tracking-tighter flex items-center justify-center gap-4 text-[#00FF00]">
                               <Zap size={32} fill="currentColor" /> {player.streak}
                            </div>
                         </div>
                         <div className="bg-white/5 p-8 rounded-[2.5rem] border-4 border-white/5">
                            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20 mb-4 italic">ЧАНСАА:</div>
                            <div className="text-4xl md:text-5xl font-black italic tracking-tighter text-white">#{myRank} <span className="text-xl md:text-2xl text-white/40">/ {allPlayers.length}</span></div>
                         </div>
                      </div>
                    )}
                  </motion.div>
                )
             )}

             {session.status === 'LEADERBOARD' && (
                <div className="text-center py-6">
                   <div className="text-[10px] font-black uppercase tracking-[0.6em] text-white/40 mb-8 italic">Чансааны хүснэгт</div>
                   
                   <div className="space-y-3 md:space-y-4 w-full">
                     {[...allPlayers].sort((a, b) => b.score - a.score).slice(0, 5).map((p, i) => (
                       <motion.div 
                         key={p.uid}
                         initial={{ opacity: 0, y: 20 }}
                         animate={{ opacity: 1, y: 0 }}
                         transition={{ delay: i * 0.1 }}
                         className={`flex items-center justify-between p-4 md:p-6 rounded-[1.5rem] border-2 md:border-4 ${
                           p.uid === player?.uid 
                             ? 'bg-[#00FF00] text-black border-[#00FF00] scale-105 shadow-xl shadow-[#00FF00]/20 z-10 relative'
                             : i === 0 
                             ? 'bg-white/10 text-white border-white/20'
                             : 'bg-white/5 text-white/60 border-white/5'
                         }`}
                       >
                         <div className="flex items-center gap-4">
                           <div className={`font-black text-xl md:text-3xl italic w-8 ${p.uid === player?.uid ? 'text-black' : 'text-white/40'}`}>
                             {i + 1}
                           </div>
                           <div className="font-black uppercase italic tracking-[-0.05em] text-lg md:text-2xl truncate max-w-[40vw] text-left">
                             {p.name} {p.uid === player?.uid && '(ТА)'}
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-black italic tracking-tighter text-2xl md:text-4xl leading-none">{p.score}</div>
                         </div>
                       </motion.div>
                     ))}
                   </div>
                   
                   {player && !([...allPlayers].sort((a, b) => b.score - a.score).slice(0, 5).some(p => p.uid === player.uid)) && (
                     <div className="mt-6 border-t-2 border-white/10 pt-6">
                       <motion.div 
                         className="flex items-center justify-between p-4 md:p-6 rounded-[1.5rem] border-2 border-white/20 bg-white/5 text-white"
                       >
                         <div className="flex items-center gap-4">
                           <div className="font-black text-xl md:text-3xl italic w-8 text-white/40">
                             {myRank}
                           </div>
                           <div className="font-black uppercase italic tracking-[-0.05em] text-lg md:text-2xl truncate max-w-[40vw] text-left">
                             {player.name} (ТА)
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-black italic tracking-tighter text-2xl md:text-4xl leading-none">{player.score}</div>
                         </div>
                       </motion.div>
                     </div>
                   )}

                   <motion.p 
                     animate={{ opacity: [0.2, 0.5, 0.2] }}
                     transition={{ duration: 2, repeat: Infinity }}
                     className="mt-8 text-white/20 font-black uppercase italic tracking-[0.4em] text-[10px]"
                   >
                     Удахгүй...
                   </motion.p>
                </div>
             )}

             {session.status === 'FINAL' && (
                <div className="text-center py-6">
                   <motion.div 
                     animate={{ y: [-10, 10] }}
                     transition={{ duration: 4, repeat: Infinity, repeatType: "mirror" }}
                     className="relative mb-12"
                   >
                      <Trophy size={100} className="text-[#FFFF44] mx-auto drop-shadow-[0_0_50px_#FFFF44]" />
                   </motion.div>
                   
                   <h2 className="text-3xl md:text-4xl font-black uppercase italic tracking-tight text-white mb-8">ШИЛДЭГ 5 ТОГЛОГЧ</h2>
                   
                   <div className="space-y-3 md:space-y-4 w-full">
                     {[...allPlayers].sort((a, b) => b.score - a.score).slice(0, 5).map((p, i) => (
                       <motion.div 
                         key={p.uid}
                         initial={{ opacity: 0, x: -20 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: i * 0.1 }}
                         className={`flex items-center justify-between p-4 md:p-6 rounded-[1.5rem] border-2 md:border-4 ${
                           p.uid === player?.uid 
                             ? 'bg-[#00FF00] text-black border-[#00FF00] scale-105 shadow-xl shadow-[#00FF00]/20 z-10 relative'
                             : i === 0 
                             ? 'bg-white/10 text-white border-white/20'
                             : 'bg-white/5 text-white/60 border-white/5'
                         }`}
                       >
                         <div className="flex items-center gap-4">
                           <div className={`font-black text-xl md:text-3xl italic w-8 ${p.uid === player?.uid ? 'text-black' : 'text-white/40'}`}>
                             {i + 1}
                           </div>
                           <div className="font-black uppercase italic tracking-[-0.05em] text-lg md:text-2xl truncate max-w-[40vw] text-left">
                             {p.name} {p.uid === player?.uid && '(ТА)'}
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-black italic tracking-tighter text-2xl md:text-4xl leading-none">{p.score}</div>
                         </div>
                       </motion.div>
                     ))}
                   </div>
                   
                   {player && !([...allPlayers].sort((a, b) => b.score - a.score).slice(0, 5).some(p => p.uid === player.uid)) && (
                     <div className="mt-6 border-t-2 border-white/10 pt-6">
                       <motion.div 
                         className="flex items-center justify-between p-4 md:p-6 rounded-[1.5rem] border-2 border-white/20 bg-white/5 text-white"
                       >
                         <div className="flex items-center gap-4">
                           <div className="font-black text-xl md:text-3xl italic w-8 text-white/40">
                             {myRank}
                           </div>
                           <div className="font-black uppercase italic tracking-[-0.05em] text-lg md:text-2xl truncate max-w-[40vw] text-left">
                             {player.name} (ТА)
                           </div>
                         </div>
                         <div className="text-right">
                           <div className="font-black italic tracking-tighter text-2xl md:text-4xl leading-none">{player.score}</div>
                         </div>
                       </motion.div>
                     </div>
                   )}

                   <button 
                    onClick={disconnect}
                    className="group mt-16 flex items-center justify-center gap-6 w-full py-8 rounded-[2rem] bg-white/[0.03] hover:bg-white text-white/30 hover:text-black border-4 border-white/5 hover:border-white font-black text-2xl uppercase italic tracking-[-0.05em] transition-all active:scale-95"
                   >
                     ГАРАХ <X size={32} className="group-hover:rotate-90 transition-transform" />
                   </button>
                </div>
             )}
           </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent Player Status Bar */}
      <AnimatePresence>
        {player && step === 'PLAYING' && (
          <motion.div 
            initial={{ y: 200 }}
            animate={{ y: 0 }}
            exit={{ y: 200 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 p-6 md:p-10 bg-[#111]/90 backdrop-blur-3xl border-t-8 border-white/5 z-50 shadow-[0_-30px_60px_rgba(0,0,0,0.8)]"
          >
            <div className="max-w-md mx-auto flex items-center justify-between">
               <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-[#00FF00] rounded-[1.5rem] flex items-center justify-center font-black text-3xl text-black rotate-6 shadow-[0_10px_20px_rgba(0,255,0,0.3)]">
                     {player.name.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                     <span className="font-black italic uppercase tracking-[-0.05em] text-3xl leading-none mb-1">{player.name}</span>
                     <div className="flex items-center gap-3">
                        <div className="h-2 w-12 bg-[#00FF00]/20 rounded-full overflow-hidden">
                           <div className="h-full bg-[#00FF00] w-full"></div>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#00FF00]">ТОГЛООМД</span>
                     </div>
                  </div>
               </div>
               <div className="text-right">
                 <div className="text-5xl font-black italic tracking-[-0.08em] leading-none mb-2">
                   {player.score}
                 </div>
                 <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">НИЙТ ОНОО</div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
