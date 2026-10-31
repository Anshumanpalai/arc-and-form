import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white border border-stone-300 p-8 sm:p-10 shadow-card">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted mb-2">SYSTEM EXCEPTION</p>
            <h1 className="font-serif text-3xl font-normal text-charcoal">An unexpected error occurred</h1>
            <p className="mt-3 text-xs text-muted leading-relaxed font-light">
              We encountered an exception while rendering this page. You can reload or return to the main archive.
            </p>
            {this.state.error?.message && (
              <pre className="mt-4 p-3 border border-stone-200 bg-[#F7F6F2] text-[11px] text-charcoal text-left overflow-auto font-mono max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="button-primary mt-6 w-full text-xs"
            >
              Reload Atelier
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
