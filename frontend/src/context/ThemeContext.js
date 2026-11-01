import React, { createContext, useContext, useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('dark-mode') === 'true'; } catch { return false; }
  });
  useEffect(() => {
    document.body.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try { localStorage.setItem('dark-mode', String(dark)); } catch { /* Tema funciona sem armazenamento. */ }
  }, [dark]);
  return <ThemeContext.Provider value={{ dark, toggle: () => setDark((current) => !current) }}>{children}</ThemeContext.Provider>;
}

export function ThemeButton() {
  const { dark, toggle } = useContext(ThemeContext);
  return <button className="theme-button" type="button" onClick={toggle} aria-label={dark ? 'Ativar modo claro' : 'Ativar modo noturno'} title={dark ? 'Modo claro' : 'Modo noturno'} aria-pressed={dark}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>;
}
