import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: 'var(--bg)', color: 'var(--text)' }}>
          <div style={{ maxWidth: '720px', width: '100%', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem' }}>
            <div style={{ color: 'var(--red)', fontFamily: 'Bebas Neue', fontSize: '2rem', marginBottom: '0.5rem' }}>APP FAILED TO RENDER</div>
            <div style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
              A runtime error occurred while loading the auction app.
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, padding: '1rem', borderRadius: '12px', background: 'var(--bg2)', border: '1px solid var(--border)', overflowX: 'auto', fontSize: '0.8rem' }}>
              {String(this.state.error?.stack || this.state.error || 'Unknown error')}
            </pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element #root was not found')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
