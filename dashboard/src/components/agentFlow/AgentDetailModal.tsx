import { 
  X, 
  Info, 
  Code2, 
  Settings2, 
  ExternalLink, 
  Check 
} from 'lucide-react';
import type { AgentDef, CanvasTheme } from '../../types/agentFlow';

const PRESET_COLORS = ['#6366f1', '#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];

interface AgentDetailModalProps {
  agent: AgentDef;
  theme: CanvasTheme;
  modalTab: 'overview' | 'mechanics' | 'customization';
  setModalTab: (tab: 'overview' | 'mechanics' | 'customization') => void;
  onClose: () => void;
  onSetCustomColor: (agentId: string, color: string) => void;
  onToggleStatus: (agentId: string, currentActive: boolean) => void;
  onUpdateNotes: (agentId: string, notes: string) => void;
  onNavigateTab: (tab: 'inbox' | 'workloads' | 'sandbox' | 'settings' | 'agents') => void;
}

export default function AgentDetailModal({
  agent,
  theme,
  modalTab,
  setModalTab,
  onClose,
  onSetCustomColor,
  onToggleStatus,
  onUpdateNotes,
  onNavigateTab
}: AgentDetailModalProps) {
  const Icon = agent.icon;

  return (
    <div className="af-modal-overlay" onClick={onClose}>
      <div className="af-modal-box" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${agent.name} settings`}>
        
        {/* Modal Header */}
        <div className="af-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div className="agent-node-icon" style={{ background: `${agent.color}20` }}>
              <Icon size={24} color={agent.color} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: theme === 'dark' ? '#f3f4f6' : '#111827' }}>
                {agent.name}
              </h3>
              <span style={{ fontSize: '0.74rem', padding: '2px 10px', borderRadius: '6px', background: agent.active ? '#dcfce7' : '#f3f4f6', color: agent.active ? '#16a34a' : '#6b7280', fontWeight: 700 }}>
                {agent.active ? '● Active Engine Agent' : '○ Idle'}
              </span>
            </div>
          </div>

          <button className="af-modal-close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="af-modal-tabs">
          <button 
            className={`af-tab-btn ${modalTab === 'overview' ? 'active' : ''}`}
            onClick={() => setModalTab('overview')}
          >
            <Info size={14} /> Telemetry & Overview
          </button>
          <button 
            className={`af-tab-btn ${modalTab === 'mechanics' ? 'active' : ''}`}
            onClick={() => setModalTab('mechanics')}
          >
            <Code2 size={14} /> Algorithm Mechanics
          </button>
          <button 
            className={`af-tab-btn ${modalTab === 'customization' ? 'active' : ''}`}
            onClick={() => setModalTab('customization')}
          >
            <Settings2 size={14} /> Node Customization
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="af-modal-body">
          {modalTab === 'overview' && (
            <div>
              <p style={{ color: theme === 'dark' ? '#9ca3af' : '#4b5563', fontSize: '0.86rem', marginTop: 0, marginBottom: '16px', lineHeight: '1.5' }}>
                {agent.desc}
              </p>

              {agent.notes && (
                <div style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '12px 14px', borderRadius: '8px', fontSize: '0.8rem', color: '#854d0e', marginBottom: '18px' }}>
                  <strong>Custom Note:</strong> {agent.notes}
                </div>
              )}

              <div style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '10px' }}>
                Live Operational Metrics
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {agent.metrics.map((m, i) => (
                  <div key={i} style={{ padding: '12px 14px', background: theme === 'dark' ? '#1e293b' : '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{m.icon}</span> Metric {i + 1}
                    </div>
                    <div style={{ fontSize: '0.92rem', fontWeight: 700, color: m.color }}>
                      {m.label}
                    </div>
                  </div>
                ))}
              </div>

              {agent.navTab && (
                <button 
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', gap: '8px', padding: '10px 16px', borderRadius: '8px' }}
                  onClick={() => {
                    onNavigateTab(agent.navTab!);
                    onClose();
                  }}
                >
                  <ExternalLink size={15} /> Open Associated Dashboard View
                </button>
              )}
            </div>
          )}

          {modalTab === 'mechanics' && (
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '8px' }}>
                Algorithm Formulation & Code Logic
              </div>
              <div className="formula-block" style={{ marginBottom: '16px' }}>
                {agent.formula}
              </div>
            </div>
          )}

          {modalTab === 'customization' && (
            <div>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Accent Theme Color
                </label>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onSetCustomColor(agent.id, c)}
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: c,
                        border: agent.color === c ? '3px solid #111827' : 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff'
                      }}
                    >
                      {agent.color === c ? <Check size={16} /> : null}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Agent Status Override
                </label>
                <button 
                  type="button"
                  className={`agent-nav-btn ${agent.active ? 'active' : ''}`}
                  onClick={() => onToggleStatus(agent.id, agent.active)}
                  style={{ 
                    padding: '10px 16px',
                    background: agent.active ? '#dcfce7' : '#f3f4f6', 
                    color: agent.active ? '#16a34a' : '#6b7280', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontWeight: 600,
                    fontSize: '0.84rem'
                  }}
                >
                  Status: {agent.active ? 'Active Agent' : 'Idle / Paused'} (Click to Toggle)
                </button>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Custom Notes & Config Parameters
                </label>
                <textarea
                  rows={3}
                  placeholder="Add custom notes, operational overrides or team documentation for this node..."
                  value={agent.notes || ''}
                  onChange={(e) => onUpdateNotes(agent.id, e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.82rem', outline: 'none' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="af-modal-footer">
          <button type="button" className="btn-primary" style={{ padding: '8px 20px', borderRadius: '8px' }} onClick={onClose}>
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
