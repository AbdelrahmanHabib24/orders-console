import React, { useEffect, useState, useCallback } from 'react';

interface HealthResponse {
  status: string;
  timestamp: string;
  service: string;
}

export const App: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = useCallback(() => {
    setLoading(true);
    setError(null);

    fetch('/api/health')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText || 'Service Unavailable'}`);
        }
        return res.json() as Promise<HealthResponse>;
      })
      .then((data: HealthResponse) => {
        setHealth(data);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        // Correctness: clear stale health data on failure so conflicting states are never shown
        setHealth(null);
        const errorMessage =
          err instanceof Error ? err.message : 'An unexpected connection error occurred';
        setError(errorMessage);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const isOperational = health?.status === 'ok';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      {/* Brand Header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
              S
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">
                SARH Orders Console
              </h1>
              <p className="text-xs text-slate-500">System Management & Connectivity</p>
            </div>
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            System Diagnostics
          </span>
        </div>
      </header>

      {/* Main Health Card */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-10">
        <section aria-labelledby="status-heading">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 id="status-heading" className="text-base font-semibold text-slate-900">
                  Backend Connectivity
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Real-time status of the Orders Console API service.
                </p>
              </div>

              <button
                type="button"
                onClick={checkHealth}
                disabled={loading}
                className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Checking...' : 'Refresh Status'}
              </button>
            </div>

            <div className="p-6" role="status" aria-live="polite">
              {/* Loading State */}
              {loading && (
                <div className="flex items-center space-x-3 py-4 text-slate-500">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Connecting to backend service...</span>
                </div>
              )}

              {/* Error State */}
              {!loading && error && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0 text-rose-600 font-bold mt-0.5">!</div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-rose-800">
                        Connection Unavailable
                      </h3>
                      <p className="text-sm text-rose-700 mt-1">{error}</p>
                      <p className="text-xs text-rose-600 mt-2">
                        Verify that the backend server is running on port 5000.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Success State */}
              {!loading && health && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    {isOperational ? (
                      <>
                        <span className="flex h-2.5 w-2.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                        <span className="text-sm font-medium text-emerald-800">
                          Backend Service is Operational
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                        <span className="text-sm font-medium text-amber-800">
                          Backend Service Status Degraded ({health.status})
                        </span>
                      </>
                    )}
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Service Status
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-slate-900 capitalize">
                        {health.status}
                      </dd>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Service Identifier
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-slate-900">
                        {health.service}
                      </dd>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Last Checked
                      </dt>
                      <dd
                        className="mt-1 text-xs font-mono text-slate-700"
                        title={health.timestamp}
                      >
                        {new Date(health.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Product Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        SARH Orders Console &bull; Internal Administration Platform
      </footer>
    </div>
  );
};

export default App;
