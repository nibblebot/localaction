import { createContext } from 'react';
import type { AppearanceState } from './AppearanceProvider.tsx';

export const AppearanceContext = createContext<AppearanceState | null>(null);