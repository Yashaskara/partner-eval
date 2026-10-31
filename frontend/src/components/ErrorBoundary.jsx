import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page" style={{ paddingTop: 120, textAlign: 'center' }}>
          <h2 style={{ fontWeight: 400 }}>Something went wrong</h2>
          <p className="text-muted">{this.state.error.message}</p>
          <button className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
