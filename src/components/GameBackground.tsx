import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface GameBackgroundProps {
  url?: string;
}

const GameBackground: React.FC<GameBackgroundProps> = ({ url }) => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base Black Background */}
      <div className="absolute inset-0 bg-[#0A0A0A]" />
      
      <AnimatePresence mode="popLayout">
        {url && (
          <motion.div
            key={url}
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <div 
              className="w-full h-full bg-cover bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${url})` }}
            />
            {/* Blurring and Darkening Overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[4px]" />
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Retro Grid Overlay - Persistent */}
      <div 
        className="absolute inset-0 opacity-[0.05]" 
        style={{ 
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', 
          backgroundSize: '80px 80px' 
        }} 
      />
    </div>
  );
};

export default GameBackground;
