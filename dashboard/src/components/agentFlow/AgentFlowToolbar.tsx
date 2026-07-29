import { 
  Columns, 
  Rows, 
  Grid, 
  Layers, 
  Zap, 
  Search, 
  Filter, 
  RotateCcw, 
  ZoomOut, 
  ZoomIn, 
  Moon, 
  Sun 
} from 'lucide-react';
import type { LayoutMode, ViewDensity, CanvasTheme, StatusFilter } from '../../types/agentFlow';

interface AgentFlowToolbarProps {
  theme: CanvasTheme;
  setTheme: React.Dispatch<React.SetStateAction<CanvasTheme>>;
  activeCount: number;
  totalCount: number;
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  density: ViewDensity;
  setDensity: (density: ViewDensity) => void;
  animateLines: boolean;
  setAnimateLines: React.Dispatch<React.SetStateAction<boolean>>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: StatusFilter;
  setStatusFilter: (filter: StatusFilter) => void;
  hasCustomPositions: boolean;
  resetPositions: () => void;
  zoomLevel: number;
  setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
}

export default function AgentFlowToolbar({
  theme,
  setTheme,
  activeCount,
  totalCount,
  layoutMode,
  setLayoutMode,
  density,
  setDensity,
  animateLines,
  setAnimateLines,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  hasCustomPositions,
  resetPositions,
  zoomLevel,
  setZoomLevel
}: AgentFlowToolbarProps) {
  return (
    <div className="af-toolbar">
      {/* Left: Engine Summary & Theme Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: theme === 'dark' ? '#f3f4f6' : '#111827' }}>◉ Agent Engine</span>
        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: '#dcfce7', color: '#16a34a', fontWeight: 600 }}>
          {activeCount}/{totalCount} Active
        </span>
        <button 
          className={`af-tool-btn ${theme === 'dark' ? 'active' : ''}`}
          onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
          title="Toggle Canvas Theme (Light / Dark)"
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />} {theme === 'light' ? 'Dark' : 'Light'} Mode
        </button>
      </div>

      {/* Middle: Customization Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Layout Mode Switcher */}
        <div className="af-btn-group">
          <button className={`af-tool-btn ${layoutMode === 'horizontal' ? 'active' : ''}`} onClick={() => setLayoutMode('horizontal')} title="Horizontal Pipeline">
            <Columns size={14} /> Pipeline
          </button>
          <button className={`af-tool-btn ${layoutMode === 'vertical' ? 'active' : ''}`} onClick={() => setLayoutMode('vertical')} title="Vertical Workflow">
            <Rows size={14} /> Workflow
          </button>
          <button className={`af-tool-btn ${layoutMode === 'grid' ? 'active' : ''}`} onClick={() => setLayoutMode('grid')} title="Grid Matrix">
            <Grid size={14} /> Grid
          </button>
        </div>

        {/* Density Toggle */}
        <div className="af-btn-group">
          <button className={`af-tool-btn ${density === 'detailed' ? 'active' : ''}`} onClick={() => setDensity('detailed')} title="Detailed Card Mode">
            <Layers size={14} /> Card
          </button>
          <button className={`af-tool-btn ${density === 'compact' ? 'active' : ''}`} onClick={() => setDensity('compact')} title="Compact Mode">
            Compact
          </button>
        </div>

        {/* Line Flow Animation Toggle */}
        <button 
          className={`af-tool-btn ${animateLines ? 'active' : ''}`}
          onClick={() => setAnimateLines(a => !a)}
          title="Toggle Pulse Animations on Connection Lines"
        >
          <Zap size={14} color={animateLines ? '#eab308' : '#9ca3af'} /> Pulse
        </button>

        {/* Search Box */}
        <div className="af-search-input">
          <Search size={14} color="#9ca3af" />
          <input 
            type="text" 
            placeholder="Filter nodes..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <div className="af-filter-select">
          <Filter size={14} color="#9ca3af" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="all">All Agents</option>
            <option value="active">Active Only</option>
            <option value="idle">Idle Only</option>
          </select>
        </div>
      </div>

      {/* Right: Reset & Zoom Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {hasCustomPositions && (
          <button 
            className="af-tool-btn" 
            onClick={resetPositions}
            title="Reset Custom Drag Positions"
            style={{ background: '#fef2f2', color: '#ef4444', borderColor: '#fecaca' }}
          >
            <RotateCcw size={13} /> Reset Layout
          </button>
        )}

        <button className="af-tool-btn" onClick={() => setZoomLevel(z => Math.max(0.6, z - 0.1))} title="Zoom Out">
          <ZoomOut size={14} />
        </button>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: theme === 'dark' ? '#9ca3af' : '#4b5563', minWidth: '36px', textAlign: 'center' }}>
          {Math.round(zoomLevel * 100)}%
        </span>
        <button className="af-tool-btn" onClick={() => setZoomLevel(z => Math.min(1.4, z + 0.1))} title="Zoom In">
          <ZoomIn size={14} />
        </button>
      </div>
    </div>
  );
}
