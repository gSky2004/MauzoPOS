import { Component } from 'react';
import { useLocation } from 'react-router-dom';
import { LanguageContext } from '../context/LanguageContext';

export class ErrorBoundary extends Component {
  static contextType = LanguageContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || '' };
  }

  componentDidCatch(error) {
    console.error('ErrorBoundary caught:', error);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    const t = this.context?.t || { error: { title: 'Something went wrong', retry: 'Try Again', home: 'Go Home' } };
    if (this.state.hasError) {
      return (
        <div className="grid min-h-[50vh] place-items-center px-4">
          <div className="card max-w-md p-8 text-center">
            <span className="text-4xl">😵</span>
            <h2 className="mt-3 font-display text-xl font-bold text-slate-900">{t.error.title}</h2>
            <p className="mt-2 text-sm text-slate-500">{this.state.message}</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={this.handleReset} className="btn-primary">{t.error.retry}</button>
              <a href="/" className="btn-outline">{t.error.home}</a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Remounts (and clears any error) on every navigation, so one crashing
// tab can never poison the other tabs.
export const RouteErrorBoundary = ({ children }) => {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
};
