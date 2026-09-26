import React from 'react';

interface DataTableProps {
  headers: string[];
  rows: (string | number)[][];
  emptyMessage?: string;
}

export const DataTable: React.FC<DataTableProps> = ({ headers, rows, emptyMessage = 'No data available' }) => {
  if (rows.length === 0) {
    return <p style={{ color: '#808080', fontStyle: 'italic' }}>{emptyMessage}</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} style={{
              textAlign: 'left', padding: '0.75rem', borderBottom: '2px solid #0f3460',
              color: '#a0a0a0', fontSize: '0.85rem', fontWeight: 600,
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} style={{ borderBottom: '1px solid #1a1a2e' }}>
            {row.map((cell, ci) => (
              <td key={ci} style={{ padding: '0.75rem', color: '#e0e0e0' }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
