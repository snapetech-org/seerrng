import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const t = useRef<number>(0);
  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setShow(false), 4200);
  }, []);
  return (
    <Ctx.Provider value={toast}>
      {children}
      {/* outside #root: an open sheet makes #root inert, which would silence the toast it fires
          as it closes */}
      {createPortal(
        <div className={`toast ${show ? 'show' : ''}`} role="status">
          <span>{msg}</span>
        </div>,
        document.body
      )}
    </Ctx.Provider>
  );
}
