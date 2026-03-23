import { Component } from "react";

const DEFAULT_TITLE = "Something went wrong";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("UI crashed:", error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, errorInfo: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    const { error, errorInfo } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="container">
        <div className="card">
          <h1>{this.props.title || DEFAULT_TITLE}</h1>
          <p className="metric-label">
            A runtime error occurred while rendering this page. Use the buttons below to recover.
          </p>
          <div className="hero-actions">
            <button type="button" onClick={this.handleReset}>
              Try Again
            </button>
            <button type="button" className="secondary-btn" onClick={() => window.location.assign("/")}>
              Go Home
            </button>
            <button type="button" className="secondary-btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>

          <p className="error">{String(error?.message || error)}</p>
          {import.meta.env.DEV && errorInfo?.componentStack ? (
            <pre style={{ whiteSpace: "pre-wrap", color: "var(--muted)" }}>{errorInfo.componentStack}</pre>
          ) : null}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
