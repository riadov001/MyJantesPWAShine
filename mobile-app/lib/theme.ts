import { useColorScheme } from 'react-native';

export const palette = {
  primary: '#dc2626',
  primaryDark: '#991b1b',
  primaryLight: '#ef4444',
  white: '#ffffff',
  black: '#000000',
};

export type Theme = {
  background: string;
  card: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryForeground: string;
  destructive: string;
  inputBg: string;
  placeholder: string;
};

export const lightTheme: Theme = {
  background: '#ffffff',
  card: '#ffffff',
  text: '#0a0a0a',
  textMuted: '#737373',
  border: '#e5e5e5',
  primary: palette.primary,
  primaryForeground: '#ffffff',
  destructive: '#ef4444',
  inputBg: '#fafafa',
  placeholder: '#a3a3a3',
};

export const darkTheme: Theme = {
  background: '#0a0a0a',
  card: '#171717',
  text: '#fafafa',
  textMuted: '#a3a3a3',
  border: '#262626',
  primary: palette.primary,
  primaryForeground: '#ffffff',
  destructive: '#ef4444',
  inputBg: '#171717',
  placeholder: '#737373',
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkTheme : lightTheme;
}

export const radius = { sm: 6, md: 10, lg: 14, xl: 20 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const typography = {
  regular: 'Exo2_400Regular',
  medium: 'Exo2_500Medium',
  semibold: 'Exo2_600SemiBold',
  bold: 'Exo2_700Bold',
};
