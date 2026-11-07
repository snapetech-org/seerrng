import { useOptionalTheme } from '@app/context/ThemeContext';

/** Native upstream composition; imported theme packages remain CSS-only. */
export default function useUpstreamTheme() {
  return useOptionalTheme()?.interfaceThemeDefinition.layout === 'upstream';
}
