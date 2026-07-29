import { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Activity, 
  Database, 
  Sparkles, 
  Play, 
  Cpu, 
  Gauge, 
  Eye, 
  Radio, 
  Server
} from 'lucide-react';
import type { 
  AgentDef, 
  ConnectionDef, 
  LayoutMode, 
  ViewDensity, 
  CanvasTheme,
  StatusFilter, 
  AgentFlowCanvasProps 
} from '../types/agentFlow';

import AgentFlowToolbar from './agentFlow/AgentFlowToolbar';
import AgentCardNode from './agentFlow/AgentCardNode';
import AgentDetailModal from './agentFlow/AgentDetailModal';

export default function AgentFlowCanvas({
  queries,
  clusters,
  driftTimeline,
  recommendations,
  optimizations,
  indexHealth,
  chatHistory,
  connectionStatus,
  pgStatus,
  onNavigateTab
}: AgentFlowCanvasProps) {
  // Customization States
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('horizontal');
  const [density, setDensity] = useState<ViewDensity>('detailed');
  const [theme, setTheme] = useState<CanvasTheme>('light');
  const [animateLines, setAnimateLines] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [zoomLevel, setZoomLevel] = useState(1);

  // Modal State
  const [activeModalAgent, setActiveModalAgent] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'overview' | 'mechanics' | 'customization'>('overview');

  // Custom node customizations (colors, overrides, notes)
  const [customColors, setCustomColors] = useState<Record<string, string>>({});
  const [statusOverrides, setStatusOverrides] = useState<Record<string, boolean>>({});
  const [agentNotes, setAgentNotes] = useState<Record<string, string>>({});

  // Drag and Drop Node State
  const [customPositions, setCustomPositions] = useState<Record<string, [number, number]>>({});
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const dragStartPos = useRef<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Base agent definitions mapped to real-time telemetry
  const baseAgentDefs: AgentDef[] = useMemo(() => [
    { id: 'proxy', name: 'TCP Proxy', desc: 'Wire-protocol intercept on port 6432', icon: Server, color: '#6366f1', navTab: null,
      formula: 'Forwards PostgreSQL wire protocol\nfrontend \u2194 backend byte streams\nListens on port 6432, relays to target DSN',
      metrics: [
        { icon: '◉', label: `${queries.length} queries intercepted`, color: '#6b7280' },
        { icon: '●', label: connectionStatus === 'connected' ? 'Proxy Online' : 'Offline', color: connectionStatus === 'connected' ? '#22c55e' : '#ef4444' },
      ],
      active: connectionStatus === 'connected' },
    { id: 'recorder', name: 'SQL Recorder', desc: 'Capturing & fingerprinting queries', icon: Database, color: '#0ea5e9', navTab: 'workloads',
      formula: 'fingerprint = SHA-256(normalize(sql))\nStored: (fingerprint, sql, latency_ms, ts)\nFlushes batch every N queries via SSE',
      metrics: [
        { icon: '◉', label: `${queries.length} stored logs`, color: '#6b7280' },
        { icon: '⚡', label: `${(queries.reduce((a: number, q: any) => a + (q.latency_ms || 0), 0) / (queries.length || 1)).toFixed(1)}ms avg latency`, color: '#f59e0b' },
      ],
      active: queries.length > 0 },
    { id: 'learner', name: 'Pattern Learner', desc: 'Embedding & clustering SQL workloads', icon: Cpu, color: '#8b5cf6', navTab: 'workloads',
      formula: 'embeddings = model(sql_text)  # 384-dim\nclusters = DBSCAN(\u03b5=0.3, min_samples=2)\nRe-clusters on cluster_updated SSE',
      metrics: [
        { icon: '◉', label: `${clusters.length} clusters discovered`, color: '#6b7280' },
        { icon: '◆', label: '384-dim vectors', color: '#8b5cf6' },
      ],
      active: clusters.length > 0 },
    { id: 'drift', name: 'Drift Detector', desc: 'Detecting workload distribution shifts', icon: Activity, color: '#f59e0b', navTab: 'workloads',
      formula: 'cosine_dist = 1 - (A\u00b7B) / (|A|\u00b7|B|)\nalert if dist > threshold (configurable)\nCompares current vs reference centroid',
      metrics: [
        { icon: '◉', label: `${driftTimeline.length} drift events`, color: '#6b7280' },
        { icon: '▲', label: driftTimeline.length > 0 ? (driftTimeline[driftTimeline.length - 1]?.drift_score?.toFixed(3) ?? '0.000') : '0.000', color: '#f59e0b' },
      ],
      active: driftTimeline.length > 0 },
    { id: 'recommender', name: 'Optimization Planner', desc: 'Generating index DDL from heuristics', icon: Sparkles, color: '#10b981', navTab: 'inbox',
      formula: 'Scans WHERE/JOIN columns per cluster\nCREATE INDEX CONCURRENTLY DDL\nValidates: ^[a-zA-Z_]\\w*$\nDouble-quotes all identifiers',
      metrics: [
        { icon: '◉', label: `${recommendations.length} pending DDL`, color: '#6b7280' },
        { icon: '★', label: `${recommendations.length} proposed indexes`, color: '#10b981' },
      ],
      active: recommendations.length > 0 },
    { id: 'executor', name: 'Execution Agent', desc: 'Running DDL with EXPLAIN cost validation', icon: Play, color: '#ef4444', navTab: 'inbox',
      formula: 'cost_before = EXPLAIN(query).total_cost\nApply DDL \u2192 cost_after\nif cost_after >= cost_before: ROLLBACK\nelse: COMMIT + log',
      metrics: [
        { icon: '◉', label: `${optimizations.length} total runs`, color: '#6b7280' },
        { icon: '✕', label: `${optimizations.filter((o: any) => o.rolled_back === true).length} rolled back`, color: '#ef4444' },
        { icon: '✓', label: `${optimizations.filter((o: any) => !o.rolled_back).length} active indexes`, color: '#22c55e' },
      ],
      active: optimizations.length > 0 },
    { id: 'benchmark', name: 'Benchmark Agent', desc: 'Measuring p50/p95/p99 latency impact', icon: Gauge, color: '#ec4899', navTab: 'inbox',
      formula: 'Runs N iterations of target query\np50 = percentile(latencies, 50)\np95 = percentile(latencies, 95)\n\u0394 = (after-before)/before \u00d7 100%',
      metrics: [
        { icon: '◉', label: `${optimizations.filter((o: any) => o.benchmark_result).length} benchmarked`, color: '#6b7280' },
      ],
      active: optimizations.some((o: any) => o.benchmark_result) },
    { id: 'health', name: 'Index Health', desc: 'Scanning pg_stat_user_indexes', icon: Eye, color: '#14b8a6', navTab: 'settings',
      formula: 'SELECT schemaname, indexrelname,\n  idx_scan, idx_tup_read\nFROM pg_stat_user_indexes\nFlags idx_scan = 0 as unused',
      metrics: [
        { icon: '◉', label: `${indexHealth.length} indexes tracked`, color: '#6b7280' },
        { icon: '⚠️', label: `${indexHealth.filter((i: any) => i.scans === 0).length} unused`, color: '#ef4444' },
        { icon: '●', label: pgStatus === 'connected' ? 'PostgreSQL Online' : 'Off', color: pgStatus === 'connected' ? '#22c55e' : '#ef4444' },
      ],
      active: indexHealth.length > 0 },
    { id: 'copilot', name: 'Copilot Chat', desc: 'Natural-language DBA assistant', icon: Radio, color: '#a855f7', navTab: null,
      formula: 'Keyword routing:\n  health \u2192 index stats\n  latency \u2192 query metrics\n  drift \u2192 workload scores\nFallback: proxy status summary',
      metrics: [
        { icon: '💬', label: `${chatHistory.length} msgs`, color: '#6b7280' },
      ],
      active: chatHistory.length > 1 },
  ], [queries, clusters, driftTimeline, recommendations, optimizations, indexHealth, chatHistory, connectionStatus, pgStatus]);

  // Apply user customizations (color overrides, status overrides, custom notes)
  const agentDefs: AgentDef[] = useMemo(() => {
    return baseAgentDefs.map(agent => ({
      ...agent,
      color: customColors[agent.id] || agent.color,
      active: statusOverrides[agent.id] !== undefined ? statusOverrides[agent.id] : agent.active,
      notes: agentNotes[agent.id] || '',
    }));
  }, [baseAgentDefs, customColors, statusOverrides, agentNotes]);

  // Connections definition
  const connections: ConnectionDef[] = useMemo(() => [
    { from: 'proxy', to: 'recorder', label: 'SQL Bytes', color: customColors['proxy'] || '#f97316' },
    { from: 'recorder', to: 'learner', label: 'Fingerprints', color: customColors['recorder'] || '#22c55e' },
    { from: 'recorder', to: 'health', label: 'Query Stats', color: customColors['health'] || '#14b8a6' },
    { from: 'recorder', to: 'drift', label: 'Query Log', color: '#94a3b8', dashed: true },
    { from: 'learner', to: 'drift', label: '384-dim Vectors', color: customColors['learner'] || '#8b5cf6' },
    { from: 'drift', to: 'recommender', label: 'Drift Alerts', color: customColors['drift'] || '#f59e0b' },
    { from: 'recommender', to: 'executor', label: 'DDL', color: customColors['recommender'] || '#10b981' },
    { from: 'recommender', to: 'copilot', label: 'Context', color: customColors['copilot'] || '#a855f7' },
    { from: 'executor', to: 'benchmark', label: 'Applied Index', color: customColors['executor'] || '#ef4444' },
  ], [customColors]);

  const cardW = density === 'detailed' ? 280 : 180;
  const cardH = density === 'detailed' ? 165 : 85;

  // Calculate default node positions per layout
  const defaultPositions = useMemo(() => {
    const pos: Record<string, [number, number]> = {};
    if (layoutMode === 'horizontal') {
      pos['proxy']       = [40, 260];
      pos['recorder']    = [410, 260];
      pos['learner']     = [780, 260];
      pos['drift']       = [1150, 260];
      pos['recommender'] = [1520, 260];
      pos['executor']    = [1890, 260];
      pos['benchmark']   = [2260, 260];
      pos['health']      = [595, 40];
      pos['copilot']     = [1520, 480];
    } else if (layoutMode === 'vertical') {
      pos['proxy']       = [370, 20];
      pos['recorder']    = [370, 200];
      pos['learner']     = [370, 380];
      pos['drift']       = [370, 560];
      pos['recommender'] = [370, 740];
      pos['executor']    = [370, 920];
      pos['benchmark']   = [370, 1100];
      pos['health']      = [30, 380];
      pos['copilot']     = [710, 740];
    } else {
      pos['proxy']       = [40, 40];
      pos['recorder']    = [350, 40];
      pos['learner']     = [660, 40];
      pos['drift']       = [40, 240];
      pos['recommender'] = [350, 240];
      pos['executor']    = [660, 240];
      pos['benchmark']   = [40, 440];
      pos['health']      = [350, 440];
      pos['copilot']     = [660, 440];
    }
    return pos;
  }, [layoutMode]);

  // Combine default and user drag positions
  const nodePositions = useMemo(() => {
    const merged = { ...defaultPositions };
    Object.keys(customPositions).forEach(id => {
      if (customPositions[id]) merged[id] = customPositions[id];
    });
    return merged;
  }, [defaultPositions, customPositions]);

  // Canvas bounds dynamically calculated so there is zero bottom or right clipping limit
  const canvasBounds = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    Object.values(nodePositions).forEach(([x, y]) => {
      if (x + cardW > maxX) maxX = x + cardW;
      if (y + cardH > maxY) maxY = y + cardH;
    });
    const defaultW = layoutMode === 'horizontal' ? 2560 : layoutMode === 'vertical' ? 1020 : 960;
    const defaultH = layoutMode === 'horizontal' ? 720 : layoutMode === 'vertical' ? 1320 : 660;
    return {
      w: Math.max(defaultW, maxX + 100),
      h: Math.max(defaultH, maxY + 160)
    };
  }, [nodePositions, layoutMode, cardW, cardH]);

  // Coordinate helper functions
  const cx = (id: string) => (nodePositions[id]?.[0] ?? 0) + cardW / 2;
  const cy = (id: string) => (nodePositions[id]?.[1] ?? 0) + cardH / 2;
  const top = (id: string) => nodePositions[id]?.[1] ?? 0;
  const bot = (id: string) => (nodePositions[id]?.[1] ?? 0) + cardH;
  const left = (id: string) => nodePositions[id]?.[0] ?? 0;
  const right = (id: string) => (nodePositions[id]?.[0] ?? 0) + cardW;

  // Path routing
  const getConnectionPath = (fromId: string, toId: string) => {
    if (customPositions[fromId] || customPositions[toId]) {
      const fx = cx(fromId), fy = cy(fromId);
      const tx = cx(toId), ty = cy(toId);
      const mx = (fx + tx) / 2, my = (fy + ty) / 2;
      return { d: `M${fx},${fy} C${mx},${fy} ${mx},${ty} ${tx},${ty}`, mx, my };
    }

    if (layoutMode === 'horizontal') {
      if (fromId === 'proxy' && toId === 'recorder') return { d: `M${right('proxy')},${cy('proxy')} L${left('recorder')},${cy('recorder')}`, mx: (right('proxy') + left('recorder')) / 2, my: cy('proxy') };
      if (fromId === 'recorder' && toId === 'learner') return { d: `M${right('recorder')},${cy('recorder')} L${left('learner')},${cy('learner')}`, mx: (right('recorder') + left('learner')) / 2, my: cy('recorder') };
      if (fromId === 'learner' && toId === 'drift') return { d: `M${right('learner')},${cy('learner')} L${left('drift')},${cy('drift')}`, mx: (right('learner') + left('drift')) / 2, my: cy('learner') };
      if (fromId === 'drift' && toId === 'recommender') return { d: `M${right('drift')},${cy('drift')} L${left('recommender')},${cy('recommender')}`, mx: (right('drift') + left('recommender')) / 2, my: cy('drift') };
      if (fromId === 'recommender' && toId === 'executor') return { d: `M${right('recommender')},${cy('recommender')} L${left('executor')},${cy('executor')}`, mx: (right('recommender') + left('executor')) / 2, my: cy('recommender') };
      if (fromId === 'executor' && toId === 'benchmark') return { d: `M${right('executor')},${cy('executor')} L${left('benchmark')},${cy('benchmark')}`, mx: (right('executor') + left('benchmark')) / 2, my: cy('executor') };
      if (fromId === 'recorder' && toId === 'health') return { d: `M${cx('recorder')},${top('recorder')} L${cx('recorder')},${cy('health')} L${left('health')},${cy('health')}`, mx: cx('recorder'), my: (top('recorder') + cy('health')) / 2 };
      if (fromId === 'recorder' && toId === 'drift') return { d: `M${cx('recorder')},${top('recorder')} L${cx('recorder')},12 L${cx('drift')},12 L${cx('drift')},${top('drift')}`, mx: (cx('recorder') + cx('drift')) / 2, my: 12 };
      if (fromId === 'recommender' && toId === 'copilot') return { d: `M${cx('recommender')},${bot('recommender')} L${cx('copilot')},${top('copilot')}`, mx: cx('recommender'), my: (bot('recommender') + top('copilot')) / 2 };
    }
    const fx = cx(fromId), fy = cy(fromId);
    const tx = cx(toId), ty = cy(toId);
    const mx = (fx + tx) / 2, my = (fy + ty) / 2;
    return { d: `M${fx},${fy} C${mx},${fy} ${mx},${ty} ${tx},${ty}`, mx, my };
  };

  const hasMovedRef = useRef(false);

  // Drag and drop event listeners
  const handleMouseDown = (agentId: string, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.af-dots, .af-badge') !== null) return;
    setDraggingNode(agentId);
    hasMovedRef.current = false;
    const currentPos = nodePositions[agentId] || [0, 0];
    dragStartPos.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: currentPos[0],
      nodeY: currentPos[1]
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingNode || !dragStartPos.current) return;
      const rawDx = e.clientX - dragStartPos.current.mouseX;
      const rawDy = e.clientY - dragStartPos.current.mouseY;
      if (Math.abs(rawDx) > 3 || Math.abs(rawDy) > 3) {
        hasMovedRef.current = true;
      }
      const dx = rawDx / zoomLevel;
      const dy = rawDy / zoomLevel;
      const newX = Math.max(0, Math.round(dragStartPos.current.nodeX + dx));
      const newY = Math.max(0, Math.round(dragStartPos.current.nodeY + dy));
      setCustomPositions(prev => ({ ...prev, [draggingNode]: [newX, newY] }));
    };

    const handleMouseUp = () => {
      if (draggingNode) {
        setDraggingNode(null);
        dragStartPos.current = null;
      }
    };

    if (draggingNode) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingNode, zoomLevel]);

  // Filtered agents
  const filteredAgents = useMemo(() => {
    return agentDefs.filter(agent => {
      const matchesSearch = agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            agent.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || 
                            (statusFilter === 'active' && agent.active) || 
                            (statusFilter === 'idle' && !agent.active);
      return matchesSearch && matchesStatus;
    });
  }, [agentDefs, searchQuery, statusFilter]);

  const agentMap = useMemo(() => Object.fromEntries(agentDefs.map(a => [a.id, a])), [agentDefs]);
  const modalAgent = activeModalAgent ? agentMap[activeModalAgent] : null;
  const activeCount = agentDefs.filter(a => a.active).length;

  const openModal = (agentId: string, initialTab: 'overview' | 'mechanics' | 'customization' = 'overview') => {
    setActiveModalAgent(agentId);
    setModalTab(initialTab);
  };

  return (
    <div 
      className={`agent-canvas theme-${theme}`} 
      onClick={(e) => { 
        if ((e.target as HTMLElement).closest('.af-card, .af-modal-box, .af-toolbar') === null) {
          setActiveModalAgent(null);
        }
      }}
      onKeyDown={(e) => { 
        if (e.key === 'Escape') {
          setActiveModalAgent(null);
        }
      }}
    >
      {/* 1. Modular Canvas Toolbar */}
      <AgentFlowToolbar
        theme={theme}
        setTheme={setTheme}
        activeCount={activeCount}
        totalCount={agentDefs.length}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        density={density}
        setDensity={setDensity}
        animateLines={animateLines}
        setAnimateLines={setAnimateLines}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        hasCustomPositions={Object.keys(customPositions).length > 0}
        resetPositions={() => setCustomPositions({})}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
      />

      {/* Canvas Container */}
      <div style={{ overflow: 'auto', width: '100%', display: 'flex', justifyContent: 'center' }} ref={canvasRef}>
        <div 
          style={{ 
            position: 'relative', 
            width: canvasBounds.w, 
            height: canvasBounds.h, 
            transform: `scale(${zoomLevel})`,
            transformOrigin: 'top center',
            transition: draggingNode ? 'none' : 'transform 0.15s ease-out, width 0.3s, height 0.3s'
          }}
        >
          {/* SVG Connections Layer */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: canvasBounds.w, height: canvasBounds.h, pointerEvents: 'none' }} viewBox={`0 0 ${canvasBounds.w} ${canvasBounds.h}`}>
            {connections.map((conn, i) => {
              const p = getConnectionPath(conn.from, conn.to);
              const pillW = conn.label.length * 7 + 20;
              return (
                <g key={i}>
                  <path 
                    d={p.d} 
                    fill="none" 
                    stroke={conn.color} 
                    strokeWidth="2.5"
                    strokeDasharray={conn.dashed ? '6 4' : 'none'}
                    style={{ animation: animateLines && !conn.dashed ? 'flowDash 1.6s linear infinite' : 'none' }} 
                  />
                  <circle cx={p.d.match(/M([\d.]+),([\d.]+)/)?.[1]} cy={p.d.match(/M([\d.]+),([\d.]+)/)?.[2]} r="4" fill={conn.color} />
                  <circle cx={p.d.match(/L([\d.]+),([\d.]+)$/)?.[1]} cy={p.d.match(/L([\d.]+),([\d.]+)$/)?.[2]} r="4" fill={conn.color} />
                  <rect x={p.mx - pillW / 2} y={p.my - 11} width={pillW} height={22} rx="11" fill={theme === 'dark' ? '#1e293b' : '#ffffff'} stroke={conn.color} strokeWidth="1.5" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }} />
                  <text x={p.mx} y={p.my + 4} textAnchor="middle" fill={conn.color} fontSize="10.5" fontWeight="700" fontFamily="Inter, sans-serif">{conn.label}</text>
                </g>
              );
            })}
          </svg>

          {/* 2. Modular Interactive Agent Cards */}
          {filteredAgents.map(agent => (
            <AgentCardNode
              key={agent.id}
              agent={agent}
              density={density}
              position={nodePositions[agent.id] || [0, 0]}
              cardW={cardW}
              cardH={cardH}
              isSelected={activeModalAgent === agent.id}
              isCustomPos={!!customPositions[agent.id]}
              isDragging={draggingNode === agent.id}
              onMouseDown={(e) => handleMouseDown(agent.id, e)}
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!hasMovedRef.current) {
                  openModal(agent.id, 'overview'); 
                }
              }}
              onOpenCustomize={(e) => {
                e.stopPropagation();
                openModal(agent.id, 'customization');
              }}
            />
          ))}
        </div>
      </div>

      {/* 3. Modular Centered Backdrop-Blur Modal */}
      {modalAgent && (
        <AgentDetailModal
          agent={modalAgent}
          theme={theme}
          modalTab={modalTab}
          setModalTab={setModalTab}
          onClose={() => setActiveModalAgent(null)}
          onSetCustomColor={(aid, color) => setCustomColors(prev => ({ ...prev, [aid]: color }))}
          onToggleStatus={(aid, currentActive) => setStatusOverrides(prev => ({ ...prev, [aid]: !currentActive }))}
          onUpdateNotes={(aid, notes) => setAgentNotes(prev => ({ ...prev, [aid]: notes }))}
          onNavigateTab={onNavigateTab}
        />
      )}
    </div>
  );
}
