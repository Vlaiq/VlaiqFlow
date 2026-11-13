import { Component, type ReactNode } from 'react';

/** Keep failed rendering/lazy imports from turning the entire app into a blank page. */
export class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="flex min-h-full items-center justify-center p-6">
      <section role="alert" className="max-w-sm rounded-card border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold">Nu am putut încărca aplicația</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">Reîncarcă pagina pentru a încerca din nou.</p>
        <button className="mt-5 min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-fg" onClick={() => window.location.reload()}>Reîncarcă pagina</button>
        <a href="/" className="ml-4 inline-flex min-h-11 items-center text-sm text-primary">Pagina principală</a>
      </section>
    </main>;
  }
}
