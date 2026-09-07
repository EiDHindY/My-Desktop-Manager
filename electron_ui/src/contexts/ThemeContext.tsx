import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

export type ThemeVariables = {
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-glass': string;
  '--border-glass': string;
  '--text-main': string;
  '--text-dim': string;
  '--accent-blue': string;
  '--accent-cyan': string;
  '--accent-purple': string;
  '--accent-red': string;
  '--accent-green': string;
  '--accent-yellow': string;
  '--accent-orange': string;
  '--cs-bg': string;
  '--cs-active-bg': string;
  '--cs-current-bg': string;
  '--cs-current-border': string;
  '--cs-text-active': string;
  '--aurora-gradient': string;
  '--aurora-pillar': string;
  '--bg-app': string;
  [key: string]: string; // For future additions
};

export const defaultThemes: Record<string, ThemeVariables> = {
  'Nord Frost': {
    '--bg-primary': '#2e3440',
    '--bg-secondary': '#3b4252',
    '--bg-glass': 'rgba(46, 52, 64, 0.85)',
    '--border-glass': 'rgba(216, 222, 233, 0.1)',
    '--text-main': '#eceff4',
    '--text-dim': 'rgba(236, 239, 244, 0.7)',
    '--accent-blue': '#88c0d0',
    '--accent-cyan': '#8fbcbb',
    '--accent-purple': '#b48ead',
    '--accent-red': '#bf616a',
    '--accent-green': '#a3be8c',
    '--accent-yellow': '#ebcb8b',
    '--accent-orange': '#d08770',
    '--cs-bg': 'rgba(46, 52, 64, 0.98)',
    '--cs-active-bg': 'rgba(136, 192, 208, 0.2)',
    '--cs-current-bg': 'rgba(216, 222, 233, 0.05)',
    '--cs-current-border': 'rgba(216, 222, 233, 0.3)',
    '--cs-text-active': '#ffffff',
    '--aurora-gradient': 'linear-gradient(90deg, rgba(136, 192, 208, 0.1) 0%, transparent 100%)',
    '--aurora-pillar': 'var(--accent-blue)',
    '--bg-app': '#2e3440'
  },
  'Obsidian Glow': {
    '--bg-primary': '#09090b',
    '--bg-secondary': '#18181b',
    '--bg-glass': 'rgba(9, 9, 11, 0.85)',
    '--border-glass': 'rgba(255, 255, 255, 0.08)',
    '--text-main': '#fafafa',
    '--text-dim': 'rgba(250, 250, 250, 0.5)',
    '--accent-blue': '#3b82f6',
    '--accent-cyan': '#06b6d4',
    '--accent-purple': '#8b5cf6',
    '--accent-red': '#ef4444',
    '--accent-green': '#10b981',
    '--accent-yellow': '#f59e0b',
    '--accent-orange': '#f97316',
    '--cs-bg': 'rgba(9, 9, 11, 0.95)',
    '--cs-active-bg': 'rgba(139, 92, 246, 0.15)',
    '--cs-current-bg': 'rgba(255, 255, 255, 0.03)',
    '--cs-current-border': 'rgba(255, 255, 255, 0.1)',
    '--cs-text-active': '#ffffff',
    '--aurora-gradient': 'linear-gradient(90deg, rgba(139, 92, 246, 0.15) 0%, transparent 100%)',
    '--aurora-pillar': 'var(--accent-purple)',
    '--bg-app': '#09090b'
  }
};

interface ThemeContextType {
  activeThemeName: string;
  setActiveThemeName: (name: string) => void;
  themes: Record<string, ThemeVariables>;
  saveTheme: (name: string, variables: ThemeVariables) => Promise<void>;
  deleteTheme: (name: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [activeThemeName, setActiveThemeNameState] = useState<string>('Nord Frost');
  const [themes, setThemes] = useState<Record<string, ThemeVariables>>(defaultThemes);

  useEffect(() => {
    async function loadSettings() {
      if (!window.electronAPI) return;
      try {
        const storedThemes = await window.electronAPI.readJSON('themes.json');
        if (storedThemes && Object.keys(storedThemes).length > 0) {
          setThemes(prev => ({ ...prev, ...storedThemes }));
        } else {
          // Initialize themes.json if empty
          await window.electronAPI.writeJSON('themes.json', defaultThemes);
        }

        const settings = await window.electronAPI.readJSON('settings.json');
        if (settings && settings.activeTheme) {
          setActiveThemeNameState(settings.activeTheme);
        } else {
          await window.electronAPI.writeJSON('settings.json', { activeTheme: 'Nord Frost' });
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    // Apply the active theme to document.documentElement
    const themeToApply = themes[activeThemeName] || defaultThemes['Nord Frost'];
    Object.entries(themeToApply).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }, [activeThemeName, themes]);

  const setActiveThemeName = async (name: string) => {
    setActiveThemeNameState(name);
    if (window.electronAPI) {
      try {
        const currentSettings = await window.electronAPI.readJSON('settings.json') || {};
        await window.electronAPI.writeJSON('settings.json', { ...currentSettings, activeTheme: name });
      } catch (e) {
        console.error('Failed to save settings', e);
      }
    }
  };

  const saveTheme = async (name: string, variables: ThemeVariables) => {
    const newThemes = { ...themes, [name]: variables };
    setThemes(newThemes);
    if (window.electronAPI) {
      try {
        await window.electronAPI.writeJSON('themes.json', newThemes);
      } catch (e) {
        console.error('Failed to save themes', e);
      }
    }
  };

  const deleteTheme = async (name: string) => {
    if (name === 'Nord Frost' || name === 'Obsidian Glow') return; // Cannot delete default themes
    const newThemes = { ...themes };
    delete newThemes[name];
    setThemes(newThemes);
    if (activeThemeName === name) {
      setActiveThemeName('Nord Frost');
    }
    if (window.electronAPI) {
      try {
        await window.electronAPI.writeJSON('themes.json', newThemes);
      } catch (e) {
        console.error('Failed to delete theme', e);
      }
    }
  };

  return (
    <ThemeContext.Provider value={{ activeThemeName, setActiveThemeName, themes, saveTheme, deleteTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
