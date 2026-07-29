import { SlidersHorizontal } from 'lucide-react';
import type { AgentDef, ViewDensity } from '../../types/agentFlow';

interface AgentCardNodeProps {
  agent: AgentDef;
  density: ViewDensity;
  position: [number, number];
  cardW: number;
  cardH: number;
  isSelected: boolean;
  isCustomPos: boolean;
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onOpenCustomize: (e: React.MouseEvent) => void;
}

export default function AgentCardNode({
  agent,
  density,
  position,
  cardW,
  cardH,
  isSelected,
  isCustomPos,
  isDragging,
  onMouseDown,
  onClick,
  onOpenCustomize
}: AgentCardNodeProps) {
  const Icon = agent.icon;

  return (
    <div 
      className={`af-card ${density} ${isSelected ? 'selected' : ''} ${isCustomPos ? 'dragged' : ''}`}
      style={{ 
        position: 'absolute', 
        left: position[0], 
        top: position[1], 
        width: cardW, 
        height: cardH,
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
      tabIndex={0} 
      role="button" 
      aria-label={`View ${agent.name} details`}
    >
      {/* Status Badge */}
      <span className={`af-badge ${agent.active ? 'active' : 'idle'}`}>
        {agent.active ? 'Active' : 'Idle'}
      </span>

      {/* Edit Options Button */}
      <span 
        className="af-dots" 
        title="Customize Agent Settings & Color"
        onClick={onOpenCustomize}
      >
        <SlidersHorizontal size={14} />
      </span>

      {/* Card Header */}
      <div className="af-card-header">
        <div className="af-icon" style={{ background: `${agent.color}18`, color: agent.color }}>
          <Icon size={density === 'detailed' ? 20 : 16} />
        </div>
        <div>
          <div className="af-title">{agent.name}</div>
          {density === 'detailed' && <div className="af-desc">{agent.desc}</div>}
        </div>
      </div>

      {density === 'detailed' && (
        <>
          <div className="af-divider" />
          <div className="af-metrics">
            {agent.metrics.map((m, mi) => (
              <span key={mi} className={`af-chip ${mi === 0 ? 'blue' : mi === 1 ? 'green' : 'purple'}`}>
                <span>{m.icon}</span>
                <span>{m.label}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
