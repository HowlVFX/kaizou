import React from 'react';
import type { PrivacyEnvelope } from '../api/types';

export const Loading: React.FC = () => (
  <div role="status" style={{ color: '#e0e0e0' }}>Loading...</div>
);

export const ErrorMessage: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" style={{ color: '#e06060' }}>Error: {message}</div>
);

/** Shown instead of metrics when the N=5 privacy floor is not met. Not an auth error. */
export const SuppressedNotice: React.FC<{ envelope: PrivacyEnvelope }> = ({ envelope }) => {
  if (!envelope.suppressed && !envelope.suppressed_groups) return null;
  return (
    <div
      role="note"
      style={{
        background: '#16213e', border: '1px solid #533483', borderRadius: '8px',
        padding: '1rem', marginBottom: '1.5rem', color: '#c0c0c0', fontSize: '0.9rem',
      }}
    >
      {envelope.suppressed ? (
        <>
          <strong style={{ color: '#e0e0e0' }}>Privacy floor not met.</strong>{' '}
          {envelope.reason}. Learner-derived metrics are hidden until at least {envelope.min_learners} learners contribute.
        </>
      ) : (
        <>
          {envelope.suppressed_groups} group(s) hidden because fewer than {envelope.min_learners} learners contributed to them.
        </>
      )}
    </div>
  );
};

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 style={{ color: '#a0a0a0', marginBottom: '1rem' }}>{children}</h3>
);

export const PageTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h1 style={{ color: '#e0e0e0', marginBottom: '1.5rem' }}>{children}</h1>
);

export const CardRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>{children}</div>
);

export const TwoColumns: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>{children}</div>
);
