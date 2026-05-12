/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Quiz {
  id: string;
  title: string;
  description: string;
  creatorId: string;
  createdAt: any;
  backgroundImageUrl?: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number;
}

export type SessionStatus = 'LOBBY' | 'STARTING' | 'QUESTION' | 'REVEAL' | 'LEADERBOARD' | 'FINAL';

export interface GameSession {
  id: string;
  quizId: string;
  hostId: string;
  pin: string;
  status: SessionStatus;
  currentQuestionIndex: number;
  questionStartedAt: any;
  questionEndsAt: any;
  backgroundImageUrl?: string;
}

export interface Player {
  id: string;
  uid: string;
  name: string;
  score: number;
  lastCorrect: boolean;
  streak: number;
  lastResponseTime?: number;
}

export interface Response {
  id: string;
  uid: string;
  questionIndex: number;
  choice: number;
  isCorrect: boolean;
  score: number;
  timestamp: any;
}
