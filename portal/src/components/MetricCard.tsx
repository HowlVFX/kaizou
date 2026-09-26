import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, color = '#0f3460' }) => (
  <div style={{
    background: '#16213e',
    borderRadius: '12px',
    padding: '1.5rem',
    borderLeft: `4px solid ${color}`,
    minWidth: '200px',
  }}>
    <div style={{ fontSize: '0.85rem', color: '#a0a0a0', marginBottom: '0.5rem' }}>{title}</div>
    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#e0e0e0' }}>{value}</div>
    {subtitle && <div style={{ fontSize: '0.75rem', color: '#808080', marginTop: '0.25rem' }}>{subtitle}</div>}
  </div>
);
