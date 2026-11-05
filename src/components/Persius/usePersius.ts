import { useOptionalTheme } from '@app/context/ThemeContext';

/** App-owned presentation. Theme packages remain validated, CSS-only data. */
export function usePersius() {
  return useOptionalTheme()?.interfaceThemeDefinition.layout === 'persius';
}

export default usePersius;
