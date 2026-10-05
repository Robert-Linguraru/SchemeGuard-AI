import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
    theme: ThemeMode;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "schemeguard-theme";

const getInitialTheme = (): ThemeMode => {
    let initialTheme: ThemeMode = "light";
    try {
        initialTheme = window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
        initialTheme = "light";
    }
    document.documentElement.dataset.theme = initialTheme;
    return initialTheme;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        try {
            window.localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            // The app still works when browser storage is unavailable.
        }
    }, [theme]);

    const value = useMemo(
        () => ({
            theme,
            toggleTheme: () => setTheme((current) => current === "light" ? "dark" : "light")
        }),
        [theme]
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const value = useContext(ThemeContext);
    if (!value) {
        throw new Error("useTheme must be used within ThemeProvider");
    }
    return value;
}
