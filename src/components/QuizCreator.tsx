/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { getFirebaseAuth, db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDocs, deleteDoc, writeBatch, query, orderBy } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Save, ImageIcon, ArrowUp, ArrowDown, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import { Question, Quiz } from '../types';

interface QuizCreatorProps {
  onClose: () => void;
  editQuiz?: Quiz;
}

export default function QuizCreator({ onClose, editQuiz }: QuizCreatorProps) {
  const [title, setTitle] = useState(editQuiz?.title || '');
  const [description, setDescription] = useState(editQuiz?.description || '');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(editQuiz?.backgroundImageUrl || '');
  const [questions, setQuestions] = useState<Partial<Question & { imageUrl?: string }>[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState('');
  const [loading, setLoading] = useState(!!editQuiz);

  useEffect(() => {
    if (editQuiz) {
      const fetchQuestions = async () => {
        try {
          const qSnap = await getDocs(query(collection(db, `quizzes/${editQuiz.id}/questions`), orderBy('order', 'asc')));
          const qs = qSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question));
          setQuestions(qs);
        } catch (err) {
          console.error("Fetch questions failed", err);
        } finally {
          setLoading(false);
        }
      };
      fetchQuestions();
    } else {
      setQuestions([{ text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 20 }]);
    }
  }, [editQuiz]);

  const addQuestion = () => {
    setQuestions([...questions, { text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 20 }]);
    setCurrentIdx(questions.length);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    const newQuestions = questions.filter((_, i) => i !== idx);
    setQuestions(newQuestions);
    if (currentIdx >= newQuestions.length) setCurrentIdx(Math.max(0, newQuestions.length - 1));
  };

  const updateQuestion = (idx: number, data: Partial<Question & { imageUrl?: string }>) => {
    const newQuestions = [...questions];
    newQuestions[idx] = { ...newQuestions[idx], ...data };
    setQuestions(newQuestions);
  };

  const moveQuestion = (idx: number, dir: 'up' | 'down') => {
    const newQuestions = [...questions];
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    
    [newQuestions[idx], newQuestions[targetIdx]] = [newQuestions[targetIdx], newQuestions[idx]];
    setQuestions(newQuestions);
    setCurrentIdx(targetIdx);
  };

  const saveQuiz = async () => {
    if (!title) return alert('Гарчиг оруулна уу');
    if (questions.some(q => !q.text || q.options?.some(o => !o))) return alert('Асуултын бүх талбарыг бөглөнө үү');

    setSaving(true);
    setSaveProgress('Эхэлж байна...');
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Та нэвтрээгүй байна. Дахин нэвтэрнэ үү.');
      }

      let quizId = editQuiz?.id;
      
      if (editQuiz) {
        const quizRef = doc(db, 'quizzes', editQuiz.id);
        await updateDoc(quizRef, { 
          title, 
          description,
          backgroundImageUrl,
          updatedAt: serverTimestamp()
        });

        setSaveProgress('Хуучин асуултуудыг цэвэрлэж байна...');
        const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
        if (qSnap.size > 0) {
          const deleteBatch = writeBatch(db);
          qSnap.docs.forEach(d => deleteBatch.delete(d.ref));
          await deleteBatch.commit();
        }
      } else {
        setSaveProgress('Шинэ тоглоом үүсгэж байна...');
        const newQuizRef = await addDoc(collection(db, 'quizzes'), {
          title,
          description,
          backgroundImageUrl,
          creatorId: user.uid,
          creatorEmail: user.email,
          createdAt: serverTimestamp()
        });
        quizId = newQuizRef.id;
      }

      if (!quizId) throw new Error('Тоглоомын ID үүсгэхэд алдаа гарлаа.');

      setSaveProgress('Асуултуудыг хадгалж байна...');
      const addBatch = writeBatch(db);
      questions.forEach((q, idx) => {
        const { id, ...cleanQ } = q;
        const qRef = doc(collection(db, `quizzes/${quizId}/questions`));
        addBatch.set(qRef, { ...cleanQ, order: idx });
      });
      
      await addBatch.commit();
      setSaveProgress('Амжилттай хадгалагдлаа!');
      
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err: any) {
      console.error("Save Quiz Error:", err);
      setSaveProgress(`Алдаа: ${err.message || 'Хадгалж чадсангүй'}`);
      // Show alert for better visibility if it's a critical error
      if (err.code === 'permission-denied') {
        alert('Хадгалах эрх хүрэлцэхгүй байна. Нэвтрэлтээ шалгана уу.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-20 text-center animate-pulse font-black uppercase italic">Асуулт хариултыг ачаалж байна...</div>;

  const currentQ = questions[currentIdx] || { text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 20 };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 min-h-screen">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12 bg-white/[0.02] p-8 rounded-[3rem] border border-white/5 backdrop-blur-3xl shadow-2xl">
        <div className="flex items-center gap-6">
          <button 
            onClick={onClose} 
            className="group p-5 hover:bg-white text-white hover:text-black rounded-3xl transition-all border-4 border-white/5 hover:border-white active:scale-95 shadow-xl"
          >
            <X size={28} className="group-hover:rotate-90 transition-transform" />
          </button>
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h2 className="text-4xl font-black uppercase tracking-[-0.05em] italic leading-none">
                {editQuiz ? 'ЗАСВАРЛАХ' : 'ҮҮСГЭХ'} <span className="text-[#00FF00]">АСУУЛТ ХАРИУЛТ</span>
              </h2>
              <span className="px-3 py-1 bg-[#00FF00]/10 text-[#00FF00] rounded-lg text-[10px] font-black uppercase tracking-widest border border-[#00FF00]/20">
                Studio V2.4
              </span>
            </div>
            <p className="text-white/20 text-xs font-black uppercase tracking-[0.4em]">Өөрийн асуулт хариултыг үүсгэнэ үү</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button 
            onClick={saveQuiz}
            disabled={saving}
            className="flex-1 md:flex-none group bg-[#00FF00] text-black px-12 py-5 rounded-[2rem] font-black uppercase italic text-2xl tracking-[-0.05em] flex items-center justify-center gap-4 disabled:opacity-20 hover:scale-[1.02] active:scale-95 transition-all shadow-[0_12px_24px_rgba(0,255,0,0.2),0_8px_0_0_#008800] active:translate-y-2 active:shadow-none"
          >
            {saving ? (
              <span className="animate-pulse">{saveProgress || 'ХАДГАЛЖ БАЙНА...'}</span>
            ) : (
              <>ХАДГАЛАХ <ChevronRight size={28} className="group-hover:translate-x-2 transition-transform" /></>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Left Column: Specs & Timeline */}
        <div className="lg:col-span-4 space-y-10">
          <section className="bg-white/[0.02] p-8 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-8 opacity-5 -mr-8 -mt-8 group-hover:rotate-12 transition-transform">
                <Zap size={120} />
             </div>
             <div className="text-[10px] uppercase tracking-[0.5em] text-[#00FF00] font-black mb-6 italic">Ерөнхий тохиргоо</div>
             <div className="space-y-6">
                <div className="space-y-2">
                   <label className="text-[9px] uppercase font-black tracking-widest text-white/30 ml-2">Тоглоомын нэр</label>
                  <input 
                    type="text" 
                    placeholder="НЭРИЙГ ОРУУЛНА УУ"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="bg-white/[0.03] border-4 border-white/5 rounded-2xl p-6 text-2xl font-black w-full outline-none focus:border-[#00FF00] focus:bg-[#00FF00]/5 transition-all uppercase italic tracking-tighter placeholder:text-white/5"
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[9px] uppercase font-black tracking-widest text-white/30 ml-2">Тайлбар</label>
                  <textarea 
                    placeholder="Тайлбар оруулна уу..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="bg-white/[0.03] border-4 border-white/5 rounded-2xl p-6 w-full outline-none focus:border-[#00FF00] focus:bg-[#00FF00]/5 transition-all resize-none text-white/60 font-medium text-sm min-h-[120px]"
                  />
                </div>
                <div className="space-y-2">
                   <label className="text-[9px] uppercase font-black tracking-widest text-white/30 ml-2">Арын зураг (URL)</label>
                  <input 
                    type="text" 
                    placeholder="Зургийн линкийг энд оруулна уу"
                    value={backgroundImageUrl}
                    onChange={e => setBackgroundImageUrl(e.target.value)}
                    className="bg-white/[0.03] border-4 border-white/5 rounded-2xl p-6 text-sm font-bold w-full outline-none focus:border-[#00FF00] focus:bg-[#00FF00]/5 transition-all tracking-tight"
                  />
                </div>
             </div>
          </section>

          <section className="bg-white/[0.01] p-8 rounded-[3rem] border border-white/5 relative overflow-hidden">
            <div className="flex items-center justify-between mb-8">
               <h4 className="text-[10px] uppercase tracking-[0.5em] text-white/20 font-black italic">Асуултын дараалал ({questions.length})</h4>
               <div className="h-px flex-1 bg-white/5 mx-4"></div>
            </div>
            
            <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {questions.map((q, idx) => (
                <motion.div 
                  key={idx}
                  layout
                  className={`group flex items-center gap-4 p-2 rounded-2.5xl transition-all ${
                    currentIdx === idx ? 'bg-[#00FF00]/5 border border-[#00FF00]/20' : 'hover:bg-white/5'
                  }`}
                >
                  <button
                    onClick={() => setCurrentIdx(idx)}
                    className={`flex-1 flex items-center px-6 py-5 rounded-[1.5rem] transition-all relative overflow-hidden ${
                      currentIdx === idx 
                        ? 'bg-[#00FF00] text-black font-black' 
                        : 'bg-white/[0.02] text-white/30 border border-white/5'
                    }`}
                  >
                    <span className="text-xl font-black italic tracking-tighter mr-4 opacity-40">{idx + 1}</span>
                    <span className="text-sm font-bold truncate uppercase tracking-tight">{q.text || 'ГАРЧИГГҮЙ АСУУЛТ'}</span>
                    {currentIdx === idx && (
                      <motion.div 
                        layoutId="active-indicator"
                        className="absolute right-4 w-2 h-2 bg-black rounded-full"
                      />
                    )}
                  </button>
                  <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                    <button onClick={() => moveQuestion(idx, 'up')} className="p-2 bg-white/5 rounded-lg hover:text-[#00FF00] hover:bg-[#00FF00]/10 transition-colors"><ArrowUp size={16} /></button>
                    <button onClick={() => moveQuestion(idx, 'down')} className="p-2 bg-white/5 rounded-lg hover:text-[#00FF00] hover:bg-[#00FF00]/10 transition-colors"><ArrowDown size={16} /></button>
                  </div>
                </motion.div>
              ))}
              <button 
                onClick={addQuestion}
                className="w-full flex items-center justify-center p-8 rounded-[2rem] border-4 border-dashed border-white/5 hover:border-[#00FF00]/40 hover:bg-[#00FF00]/5 text-white/20 hover:text-[#00FF00] transition-all group mt-6"
              >
                <Plus size={32} className="group-hover:rotate-90 transition-transform" />
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Active Target Editor */}
        <div className="lg:col-span-8">
             <motion.div 
               key={currentIdx}
               initial={{ opacity: 0, x: 40 }}
               animate={{ opacity: 1, x: 0 }}
               className="bg-white/[0.02] rounded-[4rem] p-10 md:p-16 border-4 border-white/5 shadow-3xl relative overflow-hidden min-h-[700px]"
             >
                <div className="absolute inset-0 bg-grid opacity-[0.02] pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 mb-20">
                   <div className="flex items-center gap-8">
                      <div className="w-24 h-24 bg-[#00FF00] text-black rounded-[2rem] flex items-center justify-center text-5xl font-black italic rotate-6 shadow-[0_20px_40px_rgba(0,255,0,0.3)] neon-glow-green">
                        {currentIdx + 1}
                      </div>
                      <div className="space-y-2">
                         <div className="text-[10px] font-black uppercase tracking-[0.5em] text-[#00FF00] italic">Хугацаа</div>
                         <select 
                            value={currentQ.timeLimit}
                            onChange={e => updateQuestion(currentIdx, { timeLimit: parseInt(e.target.value) })}
                            className="bg-white/5 border-4 border-white/5 rounded-2xl px-6 py-4 font-black text-2xl outline-none focus:border-[#00FF00] transition-all cursor-pointer appearance-none text-white italic tracking-tighter"
                         >
                            {[5, 10, 20, 30, 60, 120].map(t => <option key={t} value={t} className="bg-[#111]">{t} СЕКУНД</option>)}
                         </select>
                      </div>
                   </div>
                   
                   {questions.length > 1 && (
                     <button 
                      onClick={() => removeQuestion(currentIdx)}
                      className="group flex items-center gap-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-black px-8 py-5 rounded-[1.5rem] transition-all font-black uppercase text-xs tracking-widest border border-red-500/20 hover:border-red-500 active:scale-95"
                     >
                       <Trash2 size={18} className="group-hover:scale-110 transition-transform" /> УСТГАХ
                     </button>
                   )}
                </div>

                <div className="relative z-10 space-y-20">
                   <div className="space-y-4">
                      <div className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20 italic">Асуулт</div>
                      <textarea 
                        placeholder="Асуултаа энд бичнэ үү..."
                        value={currentQ.text}
                        onChange={e => updateQuestion(currentIdx, { text: e.target.value })}
                        className="bg-transparent text-5xl md:text-7xl font-black w-full outline-none placeholder:text-white/[0.02] resize-none italic tracking-[-0.05em] leading-[0.95] min-h-[200px]"
                      />
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {(currentQ.options || ['', '', '', '']).map((opt, oIdx) => (
                        <div 
                          key={oIdx}
                          className={`group flex items-center gap-6 p-8 rounded-[2.5rem] border-4 transition-all relative overflow-hidden active:scale-[0.98] ${
                            currentQ.correctIndex === oIdx 
                              ? 'bg-[#00FF00]/5 border-[#00FF00] shadow-[0_0_30px_rgba(0,255,0,0.1)]' 
                              : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                          }`}
                        >
                          <button 
                            onClick={() => updateQuestion(currentIdx, { correctIndex: oIdx })}
                            className={`flex-shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                              currentQ.correctIndex === oIdx 
                                ? 'bg-[#00FF00] text-black shadow-lg neon-glow-green rotate-6' 
                                : 'bg-white/5 text-white/20 hover:text-white border-2 border-white/5'
                            }`}
                          >
                            {currentQ.correctIndex === oIdx ? <CheckCircle2 size={36} strokeWidth={3} /> : <span className="font-black italic text-2xl">{oIdx + 1}</span>}
                          </button>
                          <div className="flex-1 space-y-1">
                              <div className="text-[8px] font-black uppercase tracking-[0.4em] opacity-20">Хариулт {oIdx + 1}</div>
                              <input 
                               type="text" 
                               value={opt}
                               onChange={e => {
                                 const newOpts = [...(currentQ.options || [])];
                                 newOpts[oIdx] = e.target.value;
                                 updateQuestion(currentIdx, { options: newOpts });
                               }}
                               placeholder={`Хариултыг энд бичнэ үү...`}
                               className="bg-transparent w-full outline-none text-3xl font-black italic tracking-tighter uppercase placeholder:text-white/5"
                             />
                          </div>
                          {currentQ.correctIndex === oIdx && (
                             <div className="absolute right-0 top-0 h-full w-2 bg-[#00FF00] shadow-[0_0_20px_#00FF00]"></div>
                          )}
                        </div>
                      ))}
                   </div>

                   <div className="flex flex-col gap-6 p-10 bg-white/[0.01] rounded-[3rem] border-4 border-dashed border-white/5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black uppercase tracking-[0.5em] text-[#00FF00] italic flex items-center gap-3">
                           <ImageIcon size={18} /> Зураг нэмэх
                        </label>
                        {(currentQ as any).imageUrl && (
                          <button 
                            onClick={() => updateQuestion(currentIdx, { imageUrl: '' } as any)}
                            className="text-[9px] font-black uppercase tracking-widest text-[#FF4444] hover:underline"
                          >
                            Устгах
                          </button>
                        )}
                      </div>
                      
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 space-y-4">
                           <input 
                              type="text"
                              placeholder="Зургийн линк (URL)..."
                              value={(currentQ as any).imageUrl || ''}
                              onChange={(e) => updateQuestion(currentIdx, { imageUrl: e.target.value } as any)}
                              className="bg-white/[0.02] border-4 border-white/5 rounded-2xl p-6 w-full outline-none focus:border-[#00FF00]/50 transition-all font-mono text-xs uppercase tracking-widest placeholder:text-white/5"
                           />
                           <p className="text-[9px] font-medium text-white/20 ml-2 italic uppercase">1:1 эсвэл 16:9 харьцаатай зураг тохиромжтой</p>
                        </div>
                        {(currentQ as any).imageUrl && (
                          <div className="w-24 h-24 rounded-2xl overflow-hidden border-4 border-white/10 flex-shrink-0 group relative cursor-pointer">
                             <img src={(currentQ as any).imageUrl} alt="Ref" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                             <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus size={24} className="text-[#00FF00] rotate-45" />
                             </div>
                          </div>
                        )}
                      </div>
                   </div>
                </div>
             </motion.div>
        </div>
      </div>
    </div>
  );
}
