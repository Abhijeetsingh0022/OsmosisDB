import type { LucideIcon } from 'lucide-react';

export type LayoutMode = 'horizontal' | 'vertical' | 'grid' | 'custom';
export type ViewDensity = 'detailed' | 'compact';
export type CanvasTheme = 'light' | 'dark' | 'glass';
export type StatusFilter = 'all' | 'active' | 'idle';

export interface AgentMetric {
  icon: string;
  label: string | number;
  color: string;
}

export interface AgentDef {
  id: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  customColor?: string;
  navTab: 'inbox' | 'workloads' | 'sandbox' | 'settings' | 'agents' | null;
  formula: string;
  metrics: AgentMetric[];
  active: boolean;
  notes?: string;
}

export interface ConnectionDef {
  from: string;
  to: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface AgentFlowCanvasProps {
  queries: any[];
  clusters: any[];
  driftTimeline: any[];
  recommendations: any[];
  optimizations: any[];
  indexHealth: any[];
  chatHistory: any[];
  connectionStatus: string;
  pgStatus: string;
  onNavigateTab: (tab: 'inbox' | 'workloads' | 'sandbox' | 'settings' | 'agents') => void;
}
