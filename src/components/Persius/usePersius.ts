import { useTheme } from '@app/context/ThemeContext';

/** App-owned presentation. Theme packages remain validated, CSS-only data. */
export function usePersius() {
  return useTheme().interfaceThemeDefinition.layout === 'persius';
}

export default usePersius;
