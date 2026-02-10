import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white p-8">
          <h1 className="text-3xl font-bold text-rose-500 mb-4">Something went wrong</h1>
          <pre className="bg-slate-900 p-4 rounded text-sm text-slate-300 overflow-auto max-w-full">
            {this.state.error?.toString()}
          </pre>
          <button 
            className="mt-6 px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-500 transition-colors"
            onClick={() => window.location.reload()}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
