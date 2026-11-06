import { Component, type ReactNode } from 'react';

// One page failing (an unexpected answer from SeerrNG, a browser quirk) must not blank
// the whole app: keep the menus, explain, and offer a reload. Keyed by location in
// main.tsx, so moving to another page starts fresh.
export class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Lumen page error', error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="empty" role="alert">
        <b>Something went wrong on this page</b>
        The rest of Lumen still works. Try again, or pick another page.
        <button
          className="btn btn-tonal btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
