import { Component, type ReactNode } from 'react';
import { useLumenLocale } from '../i18n';

// One page failing (an unexpected answer from SeerrNG, a browser quirk) must not blank
// the whole app: keep the menus, explain, and offer a reload. Keyed by location in
// main.tsx, so moving to another page starts fresh.
class PageBoundaryCore extends Component<
  {
    children: ReactNode;
    messages: { title: string; body: string; reload: string };
  },
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
        <b>{this.props.messages.title}</b>
        {this.props.messages.body}
        <button
          className="btn btn-tonal btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => window.location.reload()}
        >
          {this.props.messages.reload}
        </button>
      </div>
    );
  }
}

export function PageBoundary({ children }: { children: ReactNode }) {
  const { t } = useLumenLocale();
  return (
    <PageBoundaryCore
      messages={{
        title: t(
          'lumen.pageBoundary.title',
          'Something went wrong on this page'
        ),
        body: t(
          'lumen.pageBoundary.body',
          'The rest of Lumen still works. Try again, or pick another page.'
        ),
        reload: t('lumen.pageBoundary.reload', 'Reload'),
      }}
    >
      {children}
    </PageBoundaryCore>
  );
}
