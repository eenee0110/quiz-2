/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import { getFirebaseAuth, db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { Quiz } from '../types';
import { motion } from 'motion/react';
import { Play, Plus, Search, BookOpen, Clock, Gamepad2, Edit2, Trash2, MoreVertical } from 'lucide-react';

interface DashboardProps {
  onStartGame: (quizId: string) => void;
  onCreateQuiz: () => void;
  onEditQuiz: (quiz: Quiz) => void;
  onJoinAsPlayer: () => void;
}

export default function Dashboard({ onStartGame, onCreateQuiz, onEditQuiz, onJoinAsPlayer }: DashboardProps) {
  const auth = getFirebaseAuth();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQuizzes = useCallback(async () => {
    const auth = getFirebaseAuth();
    try {
      const q = query(
        collection(db, 'quizzes'),
        where('creatorId', '==', auth.currentUser?.uid),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quiz));
      setQuizzes(data);
    } catch (err) {
      console.error("Fetch quizzes failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuizzes();
  }, [fetchQuizzes]);

  const deleteQuiz = async (quizId: string) => {
    if (!confirm('Та энэ тоглоомыг устгахдаа итгэлтэй байна уу?')) return;
    try {
      await deleteDoc(doc(db, 'quizzes', quizId));
      setQuizzes(quizzes.filter(q => q.id !== quizId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `quizzes/${quizId}`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-12 relative">
      {/* Decorative Grid Markers */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#00FF00]/30 rounded-tl-xl pointer-events-none"></div>
      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#00FF00]/30 rounded-tr-xl pointer-events-none"></div>

      <header className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16 border-b-4 border-white/5 pb-12">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="bg-[#00FF00]/10 text-[#00FF00] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.3em] italic border border-[#00FF00]/20">
              Үйл ажиллагаа: Идэвхтэй
            </div>
            <div className="text-white/20 font-mono text-[10px] tracking-[0.2em]">{auth.currentUser?.email}</div>
          </div>
          <h2 className="text-7xl font-display font-black uppercase italic tracking-[-0.05em] leading-none">
            УДИРДЛАГЫН <span className="text-[#00FF00]">ХЭСЭГ</span>
          </h2>
          <p className="text-white/30 text-lg uppercase font-black italic tracking-widest">
            Байршуулах төв // Өндөр түвшний тэмцээн
          </p>
        </div>

        <div className="flex flex-wrap gap-4">
          <button 
            onClick={onJoinAsPlayer}
            className="group flex flex-1 sm:flex-none justify-center items-center gap-3 bg-white/5 hover:bg-white text-white hover:text-black px-8 py-5 rounded-[2.5rem] font-black uppercase italic tracking-tighter transition-all duration-300 hover:scale-[1.02] active:scale-95 border-2 border-white/10 hover:border-white shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_20px_50px_rgba(255,255,255,0.2)]"
          >
            <Gamepad2 size={24} />
            ТОГЛООМД НЭГДЭХ
          </button>
          <button 
            onClick={onCreateQuiz}
            className="group flex flex-1 sm:flex-none justify-center items-center gap-3 bg-[#00FF00] text-black px-10 py-5 rounded-[2.5rem] font-black uppercase italic tracking-tighter transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_10px_30px_rgba(0,255,0,0.2)] hover:shadow-[0_20px_50px_rgba(0,255,0,0.4)]"
          >
            <Plus size={24} className="transition-transform group-hover:rotate-90" />
            ШИНЭ ТОГЛООМ
          </button>
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="aspect-[4/3] bg-white/2 rounded-[3rem] animate-pulse border-4 border-dashed border-white/5"></div>
          ))}
        </div>
      ) : quizzes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 bg-white/[0.02] rounded-[4rem] border-4 border-dashed border-white/5 text-center px-6">
          <div className="p-10 bg-white/5 rounded-full mb-12 animate-float">
            <BookOpen size={80} className="text-[#00FF00]/20" />
          </div>
          <h3 className="text-4xl font-black uppercase italic tracking-tighter mb-4">Сан хоосон байна</h3>
          <p className="text-white/30 max-w-sm text-lg mb-12 font-medium">Таны сан одоогоор хоосон байна. Тоглоомоо эхлүүлэхийн тулд асуулт хариулт үүсгэнэ үү.</p>
          <button 
            onClick={onCreateQuiz}
            className="group relative px-12 py-6 bg-white text-black rounded-[2rem] font-black uppercase italic tracking-tighter text-2xl transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_20px_40px_rgba(255,255,255,0.1)] hover:shadow-[0_20px_60px_rgba(0,255,0,0.3)] hover:bg-[#00FF00]"
          >
            ТОГЛООМ ҮҮСГЭХ
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-12">
          {quizzes.map((quiz, idx) => (
            <motion.div 
              key={quiz.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className="group relative min-h-[320px] bg-white/[0.03] border-4 border-white/5 rounded-[3rem] p-8 md:p-10 hover:border-[#00FF00]/30 hover:bg-white/[0.05] transition-all flex flex-col justify-between overflow-hidden"
            >
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-10">
                  <div className="w-16 h-16 bg-[#00FF00]/10 text-[#00FF00] rounded-2xl flex items-center justify-center group-hover:bg-[#00FF00] group-hover:text-black transition-all rotate-3 group-hover:rotate-0 shadow-lg">
                    <BookOpen size={32} />
                  </div>
                  <div className="flex h-12 bg-black/40 rounded-2xl border border-white/5 p-1 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                    <button 
                      onClick={() => onEditQuiz(quiz)}
                      className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-colors"
                      title="Засах"
                    >
                      <Edit2 size={20} />
                    </button>
                    <div className="w-px h-full bg-white/5 mx-1" />
                    <button 
                      onClick={() => deleteQuiz(quiz.id)}
                      className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-[#FF4444] transition-colors"
                      title="Устгах"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-4xl font-black uppercase italic tracking-tight leading-[0.9] mb-4 text-white group-hover:text-[#00FF00] transition-colors">
                  {quiz.title}
                </h3>
                <div className="flex items-center gap-3">
                   <div className="h-1 w-8 bg-[#00FF00] rounded-full"></div>
                   <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Идэвхтэй байна</span>
                </div>
              </div>

              <div className="relative z-10">
                <button 
                  onClick={() => onStartGame(quiz.id)}
                  className="w-full bg-white text-black py-6 rounded-[1.5rem] font-black text-xl uppercase italic tracking-tighter flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_15px_30px_rgba(255,255,255,0.1)] hover:shadow-[0_20px_50px_rgba(0,255,0,0.3)] hover:bg-[#00FF00] group-hover:bg-[#00FF00]"
                >
                  <Play size={24} fill="currentColor" />
                  ТОГЛООМЫГ ЭХЛҮҮЛЭХ
                </button>
              </div>
              
              {/* Background Decoration */}
              <div className="absolute -right-12 -bottom-12 opacity-[0.03] group-hover:opacity-[0.08] transition-all rotate-12 scale-150 pointer-events-none grayscale group-hover:grayscale-0">
                <Gamepad2 size={200} className="text-[#00FF00]" />
              </div>
              <div className="absolute top-0 left-0 w-full h-1 bg-white/5 group-hover:bg-[#00FF00]/20 transition-all"></div>
            </motion.div>
          ))}
          
          {/* Create New Card */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={onCreateQuiz}
            className="aspect-[4/3] border-4 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center gap-6 group hover:border-[#00FF00]/20 hover:bg-white/[0.01] transition-all text-white/10 hover:text-[#00FF00]/50"
          >
             <Plus size={64} strokeWidth={3} className="transition-transform group-hover:rotate-90" />
             <span className="font-black uppercase italic tracking-[0.2em] text-sm">Шинээр нэмэх</span>
          </motion.button>
        </div>
      )}

      {/* Stats Rail */}
      <div className="mt-20 border-t-4 border-white/5 pt-12 flex flex-col md:flex-row items-center justify-between gap-12">
        <div className="flex gap-16">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20 mb-2">Үүсгэсэн тоглоом</div>
            <div className="text-5xl font-display font-black italic text-white/80">{quizzes.length.toString().padStart(2, '0')}</div>
          </div>
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20 mb-2">Системийн төлөв</div>
            <div className="text-5xl font-display font-black italic text-[#00FF00]">ОНЛАЙН</div>
          </div>
        </div>
        <div className="text-right">
           <div className="text-[10px] font-mono text-white/10 text-center md:text-right uppercase tracking-[0.2em]">
             Систем аюулгүй // Нууцлал хамгаалагдсан<br/>
             Үүлэн технологи // Хэт хурдан горим
           </div>
        </div>
      </div>
    </div>
  );
}
