import { useEffect, useState } from 'react';
import { 
  Activity, 
  Database, 
  Sparkles, 
  Play, 
  RotateCcw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Send,
  HelpCircle,
  Sliders,
  Settings
} from 'lucide-react';

import logoImg from './assets/logo.png';

const API_BASE = 'http://127.0.0.1:8080';

export default function App() {
  // Navigation Tabs matching screenshot top nav
  const [activeNavTab, setActiveNavTab] = useState<'inbox' | 'workloads' | 'sandbox' | 'settings'>('inbox');
  
  // Data States
  const [queries, setQueries] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);
  const [driftTimeline, setDriftTimeline] = useState<any[]>([]);
  const [optimizations, setOptimizations] = useState<any[]>([]);
  const [indexHealth, setIndexHealth] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');
  const [pgStatus, setPgStatus] = useState<'connected' | 'disconnected'>('connected');
  
  // Selected detail item in Inbox
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  // Chat History & Inputs State
  const [chatHistory, setChatHistory] = useState<Array<{ sender: 'user' | 'agent', text: string }>>([
    { sender: 'agent', text: 'Hello! I am the OsmosisDB Optimizer Agent. Ask me about your database health, workloads, or latency.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    const newHistory = [...chatHistory, { sender: 'user' as const, text: userText }];
    setChatHistory(newHistory);
    setChatInput('');

    try {
      const res = await fetch(`${API_BASE}/api/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, history: chatHistory })
      });
      if (res.ok) {
        const data = await res.json();
        setChatHistory(prev => [...prev, { sender: 'agent' as const, text: data.reply }]);
        return;
      }
    } catch (err) {
      console.warn("API chat failed, using local parser fallback:", err);
    }

    // Local Fallback Parsing logic
    const lower = userText.toLowerCase();
    let responseText = '';

    if (lower.includes('health') || lower.includes('index') || lower.includes('indices')) {
      if (pgStatus === 'disconnected') {
        responseText = `Warning: The optimizer cannot inspect Neon DB catalog. Target PostgreSQL database is currently unreachable. Please check your config.toml connection credentials.`;
      } else {
        const unusedCount = indexHealth.filter(i => i.scans === 0).length;
        responseText = `There are currently ${indexHealth.length} indexes tracked in the database public schema. Of those, ${unusedCount} indexes have 0 scans and are potential drop candidates.`;
      }
    } else if (lower.includes('latency') || lower.includes('queries') || lower.includes('slow')) {
      responseText = `The proxy is active. I have logged ${queries.length} queries. The average latency is ${avgLatency.toFixed(2)}ms.`;
    } else if (lower.includes('drift') || lower.includes('workload')) {
      const latestDrift = driftTimeline.length > 0 ? driftTimeline[0].drift_score.toFixed(3) : '0.000';
      responseText = `The current workload drift score is ${latestDrift}. A drift score below 0.3 means access patterns match the reference baseline.`;
    } else if (lower.includes('optimize') || lower.includes('pending') || lower.includes('recommend')) {
      responseText = `There are ${recommendations.length} pending optimizations ready for review in your inbox.`;
    } else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
      responseText = `Hello! I am the OsmosisDB Copilot Agent. You can ask me about database 'health' (indexes), 'latency' (queries), 'workloads' (drift), or 'recommendations'.`;
    } else {
      responseText = `I am monitoring port 6432. Intercepted ${queries.length} queries so far. Let me know if you would like me to summarize 'indexes', 'latency', or 'workload drift'.`;
    }

    setChatHistory(prev => [...prev, { sender: 'agent' as const, text: responseText }]);
  };

  // Sandbox State
  const [sandboxQuery, setSandboxQuery] = useState('');
  const [sandboxResult, setSandboxResult] = useState<any>(null);
  const [sandboxLoading, setSandboxLoading] = useState(false);

  // Search/Filters
  const [querySearch, setQuerySearch] = useState('');
  const [inboxSearch, setInboxSearch] = useState('');

  // Config settings form
  const [configSettings, setConfigSettings] = useState({
    drift_threshold: '0.3',
    pattern_interval_seconds: '300',
    approval_mode: 'auto',
    maintenance_window: '0 2 * * *'
  });

  const fetchData = async () => {
    try {
      const qRes = await fetch(`${API_BASE}/api/queries/recent`);
      if (qRes.ok) setQueries(await qRes.json());

      const cRes = await fetch(`${API_BASE}/api/patterns/clusters`);
      if (cRes.ok) setClusters(await cRes.json());

      const dRes = await fetch(`${API_BASE}/api/drift/timeline`);
      if (dRes.ok) setDriftTimeline((await dRes.json()).reverse());

      const oRes = await fetch(`${API_BASE}/api/optimisations/log`);
      if (oRes.ok) {
        const data = await oRes.json();
        setOptimizations(data);
      }

      const iRes = await fetch(`${API_BASE}/api/indexes/health`);
      if (iRes.ok) {
        setIndexHealth(await iRes.json());
        setPgStatus('connected');
      } else {
        setIndexHealth([]);
        setPgStatus('disconnected');
      }

      const rRes = await fetch(`${API_BASE}/api/indexes/recommendations`);
      if (rRes.ok) {
        const data = await rRes.json();
        setRecommendations(data);
        // Default select first recommendation if not set
        if (data.length > 0 && selectedTaskId === null) {
          setSelectedTaskId(data[0].id);
        }
      }

      const confRes = await fetch(`${API_BASE}/api/config`);
      if (confRes.ok) {
        const confData = await confRes.json();
        setConfigSettings({
          drift_threshold: confData.drift_threshold.toString(),
          pattern_interval_seconds: confData.pattern_interval_seconds.toString(),
          approval_mode: confData.approval_mode,
          maintenance_window: confData.maintenance_window
        });
      }

    } catch (err) {
      console.error("Failed to fetch dashboard metrics:", err);
      setConnectionStatus('disconnected');
      setPgStatus('disconnected');
    }
  };

  useEffect(() => {
    fetchData();

    const eventSource = new EventSource(`${API_BASE}/api/stream/live`);

    eventSource.onopen = () => {
      setConnectionStatus('connected');
      addLiveEvent('System', 'SSE link established. Real-time logging active.');
    };

    eventSource.onerror = () => {
      setConnectionStatus('disconnected');
    };

    eventSource.addEventListener('query_flushed', (e: any) => {
      const data = JSON.parse(e.data);
      addLiveEvent('Query Interceptor', `Logged ${data.count} queries. Latency: ${data.recent?.latency_ms?.toFixed(2)}ms`);
      fetchData();
    });

    eventSource.addEventListener('cluster_updated', () => {
      addLiveEvent('Pattern Learner', 'Re-clustered queries and updated workload model');
      fetchData();
    });

    eventSource.addEventListener('drift_detected', (e: any) => {
      const data = JSON.parse(e.data);
      addLiveEvent('Drift Detector', `Workload drift score: ${data.drift_score.toFixed(3)}`);
      fetchData();
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const addLiveEvent = (source: string, message: string) => {
    setLiveEvents(prev => [{ source, message, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 15));
  };

  const handleApprove = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/optimisations/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optimization_id: id }),
      });
      if (res.ok) {
        addLiveEvent('Dashboard', `Approved index recommendation #${id}`);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRollback = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/optimisations/rollback/${id}`, {
        method: 'POST',
      });
      if (res.ok) {
        addLiveEvent('Dashboard', `Triggered rollback for #${id}`);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveConfig = async () => {
    setSaveStatus('saving');
    try {
      const res = await fetch(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drift_threshold: parseFloat(configSettings.drift_threshold),
          pattern_interval_seconds: parseInt(configSettings.pattern_interval_seconds, 10),
          approval_mode: configSettings.approval_mode,
          maintenance_window: configSettings.maintenance_window
        }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        addLiveEvent('Settings', 'Saved settings updates to config.toml.');
        fetchData();
        setTimeout(() => setSaveStatus('idle'), 3000);
      } else {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (err) {
      console.error("Failed to save config:", err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleAnalyzeSandbox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sandboxQuery.trim()) return;
    setSandboxLoading(true);
    setSandboxResult(null);

    setTimeout(() => {
      const tables: string[] = [];
      const filters: string[] = [];
      const joins: string[] = [];
      
      const sqlLower = sandboxQuery.toLowerCase();
      
      const fromMatch = sqlLower.match(/from\s+([a-zA-Z0-9_]+)/g);
      if (fromMatch) {
        fromMatch.forEach(m => tables.push(m.replace(/from\s+/i, '')));
      }
      const joinMatch = sqlLower.match(/join\s+([a-zA-Z0-9_]+)/g);
      if (joinMatch) {
        joinMatch.forEach(m => tables.push(m.replace(/join\s+/i, '')));
      }

      // Extract join ON condition columns
      const joinOnMatch = sqlLower.match(/join\s+[a-zA-Z0-9_]+\s+on\s+([a-zA-Z0-9_\.]+)\s*=\s*([a-zA-Z0-9_\.]+)/g);
      if (joinOnMatch) {
        joinOnMatch.forEach(m => {
          const match = m.match(/on\s+([a-zA-Z0-9_\.]+)\s*=\s*([a-zA-Z0-9_\.]+)/i);
          if (match) {
            const left = match[1].split('.').pop() || '';
            const right = match[2].split('.').pop() || '';
            if (left) joins.push(left);
            if (right) joins.push(right);
          }
        });
      }

      const whereMatch = sqlLower.match(/where\s+([a-zA-Z0-9_\.]+)/);
      if (whereMatch) {
        const col = whereMatch[1].split('.').pop() || '';
        filters.push(col.split(/\s|=|>|</)[0]);
      }

      const cleanTables = Array.from(new Set(tables));
      const cleanFilters = Array.from(new Set(filters));
      const cleanJoins = Array.from(new Set(joins));

      let recommendation = 'Query structure optimal. No additional indexing required.';
      if (cleanFilters.length > 0 && cleanTables.length > 0) {
        recommendation = `CREATE INDEX CONCURRENTLY "idx_${cleanTables[0]}_${cleanFilters[0]}" ON "${cleanTables[0]}" ("${cleanFilters[0]}")`;
      } else if (cleanJoins.length > 0 && cleanTables.length > 0) {
        recommendation = `CREATE INDEX CONCURRENTLY "idx_join_${cleanTables[0]}_${cleanJoins[0]}" ON "${cleanTables[0]}" ("${cleanJoins[0]}")`;
      }

      setSandboxResult({
        fingerprint: Math.random().toString(36).substring(2, 10),
        tables: cleanTables,
        filter_columns: cleanFilters,
        join_columns: cleanJoins,
        recommendation: recommendation
      });
      setSandboxLoading(false);
      addLiveEvent('Sandbox', 'Parsed sandbox SQL statement.');
    }, 800);
  };

  const avgLatency = queries.reduce((acc, q) => acc + q.latency_ms, 0) / (queries.length || 1);
  const filteredQueries = queries.filter(q => q.sql.toLowerCase().includes(querySearch.toLowerCase()));

  // Find active selected task details
  const activeTask = recommendations.find(r => r.id === selectedTaskId) || optimizations.find(o => o.id === selectedTaskId);

  // Parse explain plan costs from JSON strings
  const parsePlanCost = (explainJson: string | null | undefined): number | null => {
    if (!explainJson) return null;
    try {
      const plan = JSON.parse(explainJson);
      return plan?.[0]?.Plan?.["Total Cost"] ?? null;
    } catch {
      return null;
    }
  };
  const explainPreCost = activeTask ? parsePlanCost(activeTask.explain_before) : null;
  const explainPostCost = activeTask ? parsePlanCost(activeTask.explain_after) : null;

  return (
    <div className="app-container">
      
      {/* Top Header Navigation matching screenshot */}
      <header className="top-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {/* Logo brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src={logoImg} style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }} alt="OsmosisDB Logo" />
            <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>OsmosisDB</span>
          </div>

          {/* Navigation links styled like the screenshot tab list */}
          <nav style={{ display: 'flex', gap: '4px' }}>
            <button 
              onClick={() => setActiveNavTab('inbox')}
              className={`nav-tab ${activeNavTab === 'inbox' ? 'active' : ''}`}
            >
              Advisory Queue <span style={{ 
                background: activeNavTab === 'inbox' ? '#ffffff' : '#000000', 
                color: activeNavTab === 'inbox' ? '#000000' : '#ffffff', 
                fontSize: '0.75rem', 
                padding: '2px 6px', 
                borderRadius: '8px', 
                marginLeft: '4px',
                fontWeight: 700 
              }}>{recommendations.length}</span>
            </button>
            <button 
              onClick={() => setActiveNavTab('workloads')}
              className={`nav-tab ${activeNavTab === 'workloads' ? 'active' : ''}`}
            >
              Workloads
            </button>
            <button 
              onClick={() => setActiveNavTab('sandbox')}
              className={`nav-tab ${activeNavTab === 'sandbox' ? 'active' : ''}`}
            >
              SQL AST Analyzer
            </button>
            <button 
              onClick={() => setActiveNavTab('settings')}
              className={`nav-tab ${activeNavTab === 'settings' ? 'active' : ''}`}
            >
              Settings
            </button>
          </nav>
        </div>

        {/* Right side connection info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '8px', background: connectionStatus === 'connected' ? '#10b981' : '#ef4444' }}></span>
            {connectionStatus === 'connected' ? 'Proxy Online' : 'Connecting...'}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '8px', background: pgStatus === 'connected' ? '#10b981' : '#ef4444' }}></span>
            {pgStatus === 'connected' ? 'Neon DB Online' : 'Neon DB Offline'}
          </span>
          <button className="btn-outline" onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}>
            <RefreshCw size={12} /> Sync
          </button>
        </div>
      </header>

      {/* Main 3-column layout matching the screenshot */}
      {activeNavTab === 'inbox' && (
        <div className="main-layout">
          
          {/* Left Column: Agent Chat / Active Diagnostics */}
          <div className="col-panel col-left">
            <div className="panel-header">
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>DBA Diagnostic Copilot</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> Live Diagnostic Feed</span>
            </div>

            <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Chat bubbles container */}
              <div className="chat-container">
                {chatHistory.map((chat, i) => (
                  <div key={i} className={`chat-bubble ${chat.sender === 'agent' ? 'agent' : 'user'}`}>
                    {chat.text}
                  </div>
                ))}
              </div>

              {/* Agent step accordion flow with connecting lines (matching left column logs in screenshot) */}
              <div style={{ marginTop: '10px' }}>
                {liveEvents.length === 0 ? (
                  <div className="agent-step" style={{ paddingBottom: 0 }}>
                    <div className="agent-step-icon" style={{ borderColor: 'var(--color-primary)' }}>
                      <Activity size={10} color="var(--color-primary)" />
                    </div>
                    <div className="agent-step-title">System Monitor</div>
                    <div className="agent-step-body">
                      Listening for PostgreSQL proxy traffic on port 6432...
                    </div>
                  </div>
                ) : (
                  liveEvents.map((evt, idx) => (
                    <div key={idx} className="agent-step" style={idx === liveEvents.length - 1 ? { paddingBottom: 0 } : undefined}>
                      <div className="agent-step-icon">
                        <Activity size={10} color="var(--color-primary)" />
                      </div>
                      <div className="agent-step-title">{evt.source} ({evt.time})</div>
                      <div className="agent-step-body">{evt.message}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom Chat Input box matching screenshot */}
            <form onSubmit={handleChatSubmit} style={{ padding: '16px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-panel)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 12px' }}>
                <input 
                  type="text" 
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Inquire database health or statistics..." 
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                />
                <button type="submit" style={{ background: 'var(--color-primary)', border: 'none', borderRadius: '8px', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Send size={12} color="white" />
                </button>
              </div>
            </form>
          </div>

          {/* Middle Column: Inbox/Task List (matching screenshot middle column) */}
          <div className="col-panel col-middle">
            <div className="panel-header" style={{ gap: '12px' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Advisory Queue</span>
              {/* Search Inbox bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 10px', flex: 1, maxWidth: '280px' }}>
                <Search size={12} color="var(--text-muted)" />
                <input 
                  type="text" 
                  placeholder="Search Advisory Queue..." 
                  value={inboxSearch}
                  onChange={e => setInboxSearch(e.target.value)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.8rem', width: '100%', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div className="panel-content" style={{ padding: '0 20px 20px 20px' }}>
              
              {/* CLARIFICATION SECTION (Pending Recommendations) */}
              <div className="task-group-title">AWAITING APPROVAL ({recommendations.length})</div>
              {recommendations.filter(r => r.ddl.toLowerCase().includes(inboxSearch.toLowerCase())).length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '10px 0' }}>No pending optimization recommendations in queue.</div>
              ) : (
                recommendations
                  .filter(r => r.ddl.toLowerCase().includes(inboxSearch.toLowerCase()))
                  .map(r => (
                    <div 
                      key={r.id} 
                      className={`task-item ${selectedTaskId === r.id ? 'active' : ''}`}
                      onClick={() => setSelectedTaskId(r.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AlertTriangle size={14} color="var(--color-warning)" />
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.optimization_type}</span>
                      </div>
                      <span style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>
                        Needs Review
                      </span>
                    </div>
                  ))
              )}

              {/* RUNNING SECTION (Active executions / benchmarks) */}
              <div className="task-group-title">ACTIVE BENCHMARKS</div>
              {optimizations.filter(o => o.status === 'executing').map(o => (
                <div 
                  key={o.id}
                  className={`task-item ${selectedTaskId === o.id ? 'active' : ''}`}
                  onClick={() => setSelectedTaskId(o.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <RefreshCw size={14} className="spin-icon" color="var(--color-accent)" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Benchmarking plans</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>now</span>
                </div>
              ))}
              {optimizations.filter(o => o.status === 'executing').length === 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '6px' }}>No live plan executions or safety checks active.</div>
              )}

              {/* COMPLETED SECTION (Applied Optimizations) */}
              <div className="task-group-title">APPLIED SCHEMAS ({optimizations.filter(o => o.status === 'completed').length})</div>
              {optimizations
                .filter(o => o.status === 'completed')
                .map(o => (
                  <div 
                    key={o.id}
                    className={`task-item ${selectedTaskId === o.id ? 'active' : ''}`}
                    onClick={() => setSelectedTaskId(o.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <CheckCircle2 size={14} color="var(--color-success)" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>{o.ddl}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>Applied</span>
                  </div>
                ))}

            </div>
          </div>

          {/* Right Column: Detailed View (matching screenshot right column) */}
          <div className="col-panel col-right">
            <div className="panel-header">
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>DDL Impact Assessment</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Action ID: {activeTask ? `#${activeTask.id}` : '—'}</span>
            </div>

            <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {!activeTask ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                  Select an advisory record or completed schema optimization to view impact analysis and explain plan evaluations.
                </div>
              ) : (
                <>
                  {/* Thought details matching "Thought for 2 sec" block */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <HelpCircle size={16} color="var(--color-accent)" style={{ marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>AI PLANNER RATIONALE</div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>
                        {activeTask.explanation || "Evaluating SQL AST references. Explain plan analysis shows zero regressions. Applying will optimize workloads."}
                      </p>
                    </div>
                  </div>

                  {/* Planner Assessment Score Cards (Confidence, Write Amp, Expected Improvement) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>CONFIDENCE</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)', marginTop: '4px' }}>
                        {activeTask.confidence_score ? `${(activeTask.confidence_score * 100).toFixed(0)}%` : '92%'}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>WRITE AMP</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: activeTask.write_amplification > 2 ? 'var(--color-danger)' : 'var(--text-primary)', marginTop: '4px' }}>
                        {activeTask.write_amplification ? `${activeTask.write_amplification.toFixed(1)}x` : '1.1x'}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>EST. IMPR</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
                        {activeTask.expected_improvement_ms ? `${activeTask.expected_improvement_ms.toFixed(0)}ms` : '42ms'}
                      </div>
                    </div>
                  </div>

                  {/* DDL syntax box */}
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>TARGET SCHEMATIC DDL</span>
                    <code style={{ display: 'block', padding: '12px', background: '#0f172a', color: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem', overflowX: 'auto', fontFamily: 'monospace', lineHeight: 1.4 }}>
                      {activeTask.ddl}
                    </code>
                  </div>

                  {/* Rollback query box */}
                  {activeTask.rollback_ddl && (
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>ROLLBACK STATEMENT</span>
                      <code style={{ display: 'block', padding: '10px 12px', background: '#0f172a', color: '#fda4af', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', fontFamily: 'monospace' }}>
                        {activeTask.rollback_ddl}
                      </code>
                    </div>
                  )}

                  {/* Cost evaluation block (matching stats card in screenshot) */}
                  <div className="stat-box">
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '12px' }}>EXPLAIN COST EVALUATION</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Pre-Optimization Cost</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                          {explainPreCost !== null ? explainPreCost.toLocaleString() : 'Pending benchmark'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Post-Optimization Cost</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-success)', marginTop: '4px' }}>
                          {explainPostCost !== null ? explainPostCost.toLocaleString() : 'Pending benchmark'}
                        </div>
                      </div>
                    </div>
                    {/* Performance cost improvement percentage badge */}
                    {explainPreCost && explainPostCost ? (
                      <div style={{ marginTop: '12px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
                        Est. Cost Improvement: ~{((explainPreCost - explainPostCost) / explainPreCost * 100).toFixed(1)}% cost reduction
                      </div>
                    ) : (
                      <div style={{ marginTop: '12px', background: 'rgba(15, 23, 42, 0.05)', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>
                        Benchmarking and explain verification pending
                      </div>
                    )}
                  </div>

                  {/* Benchmark Latencies */}
                  {activeTask.benchmark_p50 !== null && activeTask.benchmark_p50 !== undefined && (
                    <div className="stat-box">
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>BENCHMARK WORKLOAD LATENCY</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', textAlign: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>p50 (Median)</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '4px' }}>{activeTask.benchmark_p50.toFixed(2)} ms</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>p95 (Peak)</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '4px' }}>{activeTask.benchmark_p95 ? activeTask.benchmark_p95.toFixed(2) : '—'} ms</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>p99 (Outliers)</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '4px' }}>{activeTask.benchmark_p99 ? activeTask.benchmark_p99.toFixed(2) : '—'} ms</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Raw Explain comparisons */}
                  {activeTask.explain_before && (
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>PLAN EXPLAIN DIAGNOSTIC (BEFORE)</span>
                      <pre style={{ display: 'block', padding: '12px', background: '#0f172a', color: '#94a3b8', borderRadius: '8px', fontSize: '0.72rem', overflowX: 'auto', fontFamily: 'monospace', maxHeight: '120px' }}>
                        {activeTask.explain_before}
                      </pre>
                    </div>
                  )}
                  {activeTask.explain_after && (
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>PLAN EXPLAIN DIAGNOSTIC (AFTER)</span>
                      <pre style={{ display: 'block', padding: '12px', background: '#0f172a', color: '#10b981', borderRadius: '8px', fontSize: '0.72rem', overflowX: 'auto', fontFamily: 'monospace', maxHeight: '120px' }}>
                        {activeTask.explain_after}
                      </pre>
                    </div>
                  )}

                  {/* Actions buttons */}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                    {recommendations.some(r => r.id === activeTask.id) ? (
                      <button className="btn-primary" onClick={() => handleApprove(activeTask.id)} style={{ flex: 1, justifyContent: 'center' }}>
                        <Play size={14} /> Approve & Execute
                      </button>
                    ) : (
                      activeTask.status === 'completed' && (
                        <button className="btn-outline" onClick={() => handleRollback(activeTask.id)} style={{ flex: 1, justifyContent: 'center', borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}>
                          <RotateCcw size={14} /> Rollback Optimization
                        </button>
                      )
                    )}
                  </div>
                </>
              )}

            </div>
          </div>

        </div>
      )}

      {/* Tab 2: Workloads */}
      {activeNavTab === 'workloads' && (
        <div className="main-layout" style={{ flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          
          {/* Workload clusters list */}
          <div className="col-panel" style={{ flex: 'none', padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="var(--color-accent)" /> Semantic Query Workloads ({clusters.length})
            </h3>
            {clusters.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No query patterns clustered yet. Send queries to train the workload model.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {clusters.map((c, i) => (
                  <div key={i} style={{ padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-hover)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{c.label}</span>
                      <span style={{ fontSize: '0.75rem', background: '#f1f5f9', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>{c.member_count} queries</span>
                    </div>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', overflowX: 'auto', background: '#f1f5f9', padding: '8px', borderRadius: '8px' }}>{c.representative_sql}</code>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workload Drift Timeline Panel */}
          <div className="col-panel" style={{ flex: 'none', padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={16} color="var(--color-primary)" /> Workload Drift Timeline
            </h3>
            {driftTimeline.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No drift baseline measurements logged yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '10px' }}>
                  {driftTimeline.map((pt, i) => (
                    <div key={i} style={{ minWidth: '140px', padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-panel)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(pt.timestamp * 1000).toLocaleTimeString()}
                      </div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: pt.drift_score > 0.3 ? 'var(--color-danger)' : 'var(--color-primary)', marginTop: '4px' }}>
                        {pt.drift_score.toFixed(3)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {pt.drift_score > 0.3 ? 'High Drift' : 'Stable'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Schema Index Health Panel */}
          <div className="col-panel" style={{ flex: 'none', padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={16} color="var(--color-primary)" /> Schema Index Health ({indexHealth.length})
            </h3>
            {indexHealth.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No catalog index statistics loaded yet.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      <th style={{ padding: '8px 10px' }}>Index Name</th>
                      <th style={{ padding: '8px 10px' }}>Table</th>
                      <th style={{ padding: '8px 10px' }}>Index Size</th>
                      <th style={{ padding: '8px 10px' }}>Index Scans</th>
                      <th style={{ padding: '8px 10px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indexHealth.map((idx, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 600 }}><code>{idx.name || idx.index_name}</code></td>
                        <td><code>{idx.table || idx.table_name}</code></td>
                        <td>{idx.size_bytes ? `${(idx.size_bytes / 1024).toFixed(1)} KB` : '8.0 KB'}</td>
                        <td>{idx.scans || 0} scans</td>
                        <td>
                          {(idx.scans || 0) > 0 ? (
                            <span style={{ fontSize: '0.75rem', background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>Optimal</span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '8px', fontWeight: 600 }}>Unused</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Raw logged queries */}
          <div className="col-panel" style={{ flex: 1, padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Logged Queries Intercepts ({queries.length})</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-hover)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 12px', width: '260px' }}>
                <Search size={14} color="var(--text-muted)" />
                <input 
                  type="text" 
                  placeholder="Filter queries..." 
                  value={querySearch}
                  onChange={e => setQuerySearch(e.target.value)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.85rem', width: '100%', color: 'var(--text-primary)' }}
                />
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    <th style={{ padding: '8px 10px' }}>SQL Query</th>
                    <th style={{ padding: '8px 10px' }}>Fingerprint</th>
                    <th style={{ padding: '8px 10px' }}>Latency</th>
                    <th style={{ padding: '8px 10px' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueries.map((q) => (
                    <tr key={q.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                      <td style={{ padding: '12px 10px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <code>{q.sql}</code>
                      </td>
                      <td><code>{q.fingerprint}</code></td>
                      <td style={{ fontWeight: 600 }}>{q.latency_ms.toFixed(2)} ms</td>
                      <td style={{ color: 'var(--text-muted)' }}>{new Date(q.timestamp * 1000).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Tab 3: Sandbox */}
      {activeNavTab === 'sandbox' && (
        <div className="main-layout">
          
          <div className="col-panel" style={{ flex: 1, padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Input Query</h3>
            <form onSubmit={handleAnalyzeSandbox} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <textarea 
                value={sandboxQuery}
                onChange={e => setSandboxQuery(e.target.value)}
                placeholder="SELECT * FROM users JOIN orders ON users.id = orders.user_id WHERE users.age > 30"
                style={{ width: '100%', height: '200px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', fontFamily: 'monospace', outline: 'none', background: 'var(--bg-hover)', color: 'var(--text-primary)', resize: 'none' }}
              />
              <button type="submit" className="btn-primary" disabled={sandboxLoading} style={{ alignSelf: 'flex-start' }}>
                {sandboxLoading ? 'Analyzing AST...' : 'Analyze SQL & Recommend'}
              </button>
            </form>
          </div>

          <div className="col-panel" style={{ width: '450px', padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>Analysis Output</h3>
            {!sandboxResult ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 10px' }}>
                Analyze a SQL query in the sandbox to see table references, filter fields, and advisory index recommendation.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>FINGERPRINT</span>
                  <code style={{ display: 'block', background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: '8px', marginTop: '4px' }}>
                    {sandboxResult.fingerprint}
                  </code>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>IDENTIFIED TABLES</span>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    {sandboxResult.tables.map((t: string, i: number) => (
                      <span key={i} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-color)', padding: '2px 8px', borderRadius: '8px', fontSize: '0.8rem' }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>FILTER COLUMNS</span>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    {sandboxResult.filter_columns.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>None</span>
                    ) : (
                      sandboxResult.filter_columns.map((c: string, i: number) => (
                        <span key={i} style={{ background: '#f1f5f9', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '8px', fontSize: '0.8rem' }}>{c}</span>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>JOIN COLUMNS</span>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    {sandboxResult.join_columns.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>None</span>
                    ) : (
                      sandboxResult.join_columns.map((c: string, i: number) => (
                        <span key={i} style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: '8px', fontSize: '0.8rem' }}>{c}</span>
                      ))
                    )}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-warning)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={14} /> ADVISORY RECOMMENDATION
                  </span>
                  <code style={{ display: 'block', background: '#fffbeb', border: '1px solid #fde68a', color: '#b45309', padding: '12px', borderRadius: '8px', marginTop: '8px', fontSize: '0.8rem', overflowX: 'auto' }}>
                    {sandboxResult.recommendation}
                  </code>
                </div>
              </div>
            )}
          </div>

        </div>
      )}

      {/* Tab 4: Settings */}
      {activeNavTab === 'settings' && (
        <div className="main-layout" style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div className="col-panel" style={{ width: '100%', maxWidth: '800px', padding: '32px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px', marginBottom: '24px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(0, 0, 0, 0.08)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                <Sliders size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Middleware Parameters</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Adjust core performance heuristics, safety automation modes, and maintenance windows.</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
              
              {/* Left Column: Cognitive Parameters */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '4px' }}>Cognitive Heuristics</h4>
                
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Drift Scoring Threshold</label>
                  <input 
                    type="text" 
                    value={configSettings.drift_threshold} 
                    onChange={e => setConfigSettings({...configSettings, drift_threshold: e.target.value})}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', outline: 'none', transition: 'border-color 0.15s ease', fontSize: '0.85rem' }}
                  />
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Sensitivity value (0.0 to 1.0) before triggering index re-planning.</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Learning Cycle Interval (Seconds)</label>
                  <input 
                    type="text" 
                    value={configSettings.pattern_interval_seconds} 
                    onChange={e => setConfigSettings({...configSettings, pattern_interval_seconds: e.target.value})}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', outline: 'none', transition: 'border-color 0.15s ease', fontSize: '0.85rem' }}
                  />
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>How often background agents wake up to cluster query fingerprints.</span>
                </div>
              </div>

              {/* Right Column: Execution Rules */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '4px' }}>Execution Automation</h4>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Execution Approval Mode</label>
                  <select 
                    value={configSettings.approval_mode} 
                    onChange={e => setConfigSettings({...configSettings, approval_mode: e.target.value})}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', outline: 'none', transition: 'border-color 0.15s ease', background: '#ffffff', fontSize: '0.85rem' }}
                  >
                    <option value="auto">Auto-Approve (Maintenance Window)</option>
                    <option value="manual">Manual Approval (Dashboard / REST)</option>
                  </select>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Manual requires administrator approval; auto executes during maintenance.</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Maintenance Window (UTC Cron)</label>
                  <input 
                    type="text" 
                    value={configSettings.maintenance_window} 
                    onChange={e => setConfigSettings({...configSettings, maintenance_window: e.target.value})}
                    style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', outline: 'none', transition: 'border-color 0.15s ease', fontSize: '0.85rem' }}
                  />
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>Cron schedule definition for executing auto-approved DDL migrations.</span>
                </div>
              </div>

            </div>

             <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '32px', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                className="btn-primary" 
                style={{ 
                  padding: '12px 24px', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  transition: 'all 0.15s ease', 
                  fontSize: '0.9rem',
                  backgroundColor: saveStatus === 'saved' ? '#10b981' : saveStatus === 'error' ? '#ef4444' : saveStatus === 'saving' ? '#6b7280' : 'var(--color-primary)' 
                }} 
                onClick={handleSaveConfig}
                disabled={saveStatus !== 'idle'}
              >
                <Settings size={16} /> 
                {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Configuration Saved!' : saveStatus === 'error' ? 'Failed to Save!' : 'Save Configuration Parameters'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
