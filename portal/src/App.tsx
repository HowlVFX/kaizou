import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { PortalShell } from './components/PortalShell';
import { PortalAuthGuard } from './components/PortalAuthGuard';

import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PopulationPage } from './pages/PopulationPage';
import { GraderPage } from './pages/GraderPage';
import { MemoryPage } from './pages/MemoryPage';
import { ProbesPage } from './pages/ProbesPage';
import { GraphPage } from './pages/GraphPage';
import { SourcesPage } from './pages/SourcesPage';
import { GenerationPage } from './pages/GenerationPage';
import { ClustersPage } from './pages/ClustersPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { ExportPage } from './pages/ExportPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      
      <Route path="/" element={<PortalAuthGuard><PortalShell /></PortalAuthGuard>}>
        <Route index element={<OverviewPage />} />
        <Route path="population" element={<PopulationPage />} />
        <Route path="grader" element={<GraderPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="probes" element={<ProbesPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="generation" element={<GenerationPage />} />
        <Route path="clusters" element={<ClustersPage />} />
        <Route path="evaluation" element={<EvaluationPage />} />
        <Route path="export" element={<ExportPage />} />
      </Route>
    </Routes>
  );
};

export default App;
