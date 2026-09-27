import { useState, useCallback, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { useApp } from "../context/AppContext"
import KnowledgeGraph from "../components/KnowledgeGraph"
import ConceptExplorer from "../components/ConceptExplorer"
import ClusterExplorer from "../components/ClusterExplorer"
import ExplainOverlay from "../components/ExplainOverlay"
import PathLearning from "../components/PathLearning"
import { recallStatus } from "../data/demo"
import type { MasterCluster } from "../types"

const assetPathPrefix = "/assets"
const imgSearch = `${assetPathPrefix}/b4ecd.svg`
const imgNotesIcon = `${assetPathPrefix}/1e312.svg`
const imgTarget = `${assetPathPrefix}/40856.svg`

const panel: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "0.8px solid var(--border)",
  boxShadow: "var(--shadow)",
}

function useVW() {
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setVw(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return vw;
}

type ViewMode = "overview" | "detailed";

type ExplorerLayer =
  | { type: "concept"; nodeId: string }
  | { type: "cluster"; clusterId: string }
  | { type: "explain"; nodeId: string }
  | { type: "path"; nodeId: string }
  | { type: "cluster-path"; clusterId: string }

export default function BrainPage() {
  const { nodes, edges, clusters, graphStatus, graphError, refreshGraph } = useApp()
  const navigate = useNavigate()
  const vw = useVW()
  const isMobile = vw < 640

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null)
  const [expandedClusterIds, setExpandedClusterIds] = useState<string[]>([])
  const [focusedClusterId, setFocusedClusterId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("overview")

  const [explorerStack, setExplorerStack] = useState<ExplorerLayer[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [mobileAttentionOpen, setMobileAttentionOpen] = useState(false)

  // Derived stack state
  const topLayer = explorerStack[explorerStack.length - 1]
  const hasChild = explorerStack.length > 1
  const conceptLayer = explorerStack.find((l): l is Extract<ExplorerLayer, { type: "concept" }> => l.type === "concept")
  const clusterLayer = explorerStack.find((l): l is Extract<ExplorerLayer, { type: "cluster" }> => l.type === "cluster")

  // Active nodes resolved from stack
  const activeConceptNode = conceptLayer ? nodes.find(n => n.id === conceptLayer.nodeId) ?? null : null
  const activeCluster = clusterLayer ? clusters.find(c => c.id === clusterLayer.clusterId) ?? null : null
  const explainNode = topLayer?.type === "explain" ? nodes.find(n => n.id === topLayer.nodeId) ?? null : null
  const pathNode = (() => {
    if (topLayer?.type === "path") return nodes.find(n => n.id === topLayer.nodeId) ?? null
    if (topLayer?.type === "cluster-path") {
      const c = clusters.find(cl => cl.id === (topLayer as Extract<ExplorerLayer, { type: "cluster-path" }>).clusterId)
      const nid = c?.keyNodeIds?.[0] ?? c?.nodeIds[0]
      return nid ? nodes.find(n => n.id === nid) ?? null : null
    }
    return null
  })()

  const pathClusterId = topLayer?.type === "cluster-path"
    ? (topLayer as Extract<ExplorerLayer, { type: "cluster-path" }>).clusterId
    : undefined

  // Navigation functions
  const openConcept = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setSelectedClusterId(null)
    setExplorerStack([{ type: "concept", nodeId }])
  }, [])

  const openCluster = useCallback((clusterId: string) => {
    setSelectedClusterId(clusterId)
    setSelectedNodeId(null)
    setExplorerStack([{ type: "cluster", clusterId }])
  }, [])

  const pushLayer = useCallback((layer: ExplorerLayer) => {
    setExplorerStack(prev => [...prev, layer])
  }, [])

  const goBackLayer = useCallback(() => {
    setExplorerStack(prev => prev.slice(0, -1))
  }, [])

  const closeExplorerStack = useCallback(() => {
    setExplorerStack([])
    setSelectedNodeId(null)
    setSelectedClusterId(null)
  }, [])

  const handleNodeSelect = useCallback((id: string | null) => {
    if (id) openConcept(id)
    else closeExplorerStack()
  }, [openConcept, closeExplorerStack])

  const handleClusterSelect = useCallback((id: string | null) => {
    if (id) openCluster(id)
    else closeExplorerStack()
  }, [openCluster, closeExplorerStack])

  const handleClusterToggle = useCallback((id: string) => {
    setExpandedClusterIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }, [])

  const handleRetestClick = (nodeId: string) =>
    navigate("/retest", { state: { nodeId } })

  const needsAttention = nodes
    .filter((n) => n.recall !== null && n.recall < 50)
    .slice(0, 4)

  const attentionClusters = clusters.filter(c =>
    c.nodeIds.some(nid => nodes.find(n => n.id === nid && n.recall !== null && (n.recall as number) < 50))
  )

  const filteredNodes = searchQuery
    ? nodes.filter((n) => n.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : []
  const filteredClusters = searchQuery
    ? clusters.filter((c) => c.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  const stats = {
    total: nodes.filter((n) => !n.locked).length,
    healthy: nodes.filter((n) => n.recall !== null && n.recall >= 75).length,
    weakening: nodes.filter((n) => n.recall !== null && n.recall >= 50 && n.recall < 75).length,
    review: nodes.filter((n) => n.recall !== null && n.recall < 50).length,
  }

  // ─── MOBILE LAYOUT ────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg)", position: "relative", overflow: "hidden" }}>

        {/* ── Mobile Top Bar ── */}
        <div style={{
          flexShrink: 0, height: 48,
          background: "var(--bg-elevated)",
          borderBottom: "0.8px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px", gap: 8, zIndex: 10,
        }}>
          {/* Stats dots */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <MobileStatDot value={stats.healthy} color="var(--green)" />
            <MobileStatDot value={stats.weakening} color="var(--orange)" />
            {stats.review > 0 && (
              <button
                onClick={() => setMobileAttentionOpen(v => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "none", border: "none", cursor: "pointer",
                  padding: 0, fontFamily: "inherit",
                }}
              >
                <MobileStatDot value={stats.review} color="var(--red)" />
                <span style={{ fontSize: 10, color: "var(--red)", fontWeight: 700 }}>!</span>
              </button>
            )}
          </div>

          {/* View toggle — center */}
          <div style={{
            ...panel, borderRadius: 16, padding: "4px 6px",
            display: "flex", gap: 2, alignItems: "center",
          }}>
            {(["overview", "detailed"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "4px 10px", borderRadius: 12,
                  background: viewMode === mode ? "var(--blue)" : "none",
                  color: viewMode === mode ? "#fff" : "var(--text-muted)",
                  border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                  fontFamily: "inherit", transition: "all 0.15s",
                }}
              >
                {mode === "overview" ? "Overview" : "Detailed"}
              </button>
            ))}
          </div>

          {/* Search icon */}
          <button
            onClick={() => setMobileSearchOpen(v => !v)}
            style={{
              width: 36, height: 36, borderRadius: 18, flexShrink: 0,
              background: mobileSearchOpen ? "var(--blue)" : "var(--bg-input)",
              border: "0.8px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <img src={imgSearch} alt="Search" style={{ width: 15, height: 15, opacity: mobileSearchOpen ? 1 : 0.6, filter: mobileSearchOpen ? "brightness(10)" : "none" }} />
          </button>
        </div>

        {/* ── Mobile Search Bar (expandable) ── */}
        {mobileSearchOpen && (
          <div style={{
            flexShrink: 0, padding: "8px 12px",
            background: "var(--bg-elevated)",
            borderBottom: "0.8px solid var(--border)",
            zIndex: 10, position: "relative",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--bg-input)", borderRadius: 12, padding: "0 12px", height: 38,
            }}>
              <img src={imgSearch} alt="" style={{ width: 13, height: 13, opacity: 0.5 }} />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                placeholder="Search concepts or clusters..."
                style={{
                  background: "none", border: "none", outline: "none",
                  color: "var(--text)", fontSize: 13, fontFamily: "inherit", flex: 1,
                }}
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchOpen(false); }}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
                  ×
                </button>
              )}
            </div>
            {searchOpen && searchQuery && (
              <div style={{
                position: "absolute", top: "100%", left: 12, right: 12,
                ...panel, borderRadius: 14,
                overflow: "hidden", maxHeight: 260, overflowY: "auto", zIndex: 50,
              }}>
                <MobileSearchResults
                  filteredClusters={filteredClusters}
                  filteredNodes={filteredNodes}
                  onClusterSelect={(id) => { handleClusterSelect(id); setSearchQuery(""); setSearchOpen(false); setMobileSearchOpen(false); }}
                  onNodeSelect={(id) => { handleNodeSelect(id); setSearchQuery(""); setSearchOpen(false); setMobileSearchOpen(false); }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Focused cluster banner ── */}
        {focusedClusterId && (() => {
          const fc = clusters.find(c => c.id === focusedClusterId);
          return fc ? (
            <div style={{
              flexShrink: 0, padding: "6px 12px",
              background: "var(--bg-elevated)", borderBottom: "0.8px solid var(--border)",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--blue)" }}>Focus</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", flex: 1 }}>{fc.label}</span>
              <button onClick={() => setFocusedClusterId(null)} style={{
                fontSize: 11, color: "var(--text-muted)", background: "none",
                border: "1px solid var(--border)", borderRadius: 10, padding: "2px 8px",
                cursor: "pointer", fontFamily: "inherit",
              }}>Exit</button>
            </div>
          ) : null;
        })()}

        {/* ── Graph Area (fills remaining space) ── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden", minHeight: 0 }}>
          <KnowledgeGraph
            nodes={nodes}
            edges={edges}
            clusters={clusters}
            selectedNodeId={selectedNodeId}
            selectedClusterId={selectedClusterId}
            viewMode={viewMode}
            expandedClusterIds={expandedClusterIds}
            focusedClusterId={focusedClusterId}
            onNodeSelect={handleNodeSelect}
            onClusterSelect={handleClusterSelect}
            onClusterToggle={handleClusterToggle}
            compact={true}
          />
          <GraphStateOverlay status={graphStatus} error={graphError} isEmpty={nodes.length === 0} onRetry={refreshGraph} onAddNote={() => navigate("/notes")} />

          {/* Zoom controls — floating bottom-right */}
          <div style={{
            position: "absolute", bottom: 16, right: 12,
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            {[
              { label: "+", action: () => document.dispatchEvent(new CustomEvent("graph-zoom-in")) },
              { label: "−", action: () => document.dispatchEvent(new CustomEvent("graph-zoom-out")) },
              { label: "⊙", action: () => document.dispatchEvent(new CustomEvent("graph-zoom-reset")) },
            ].map(({ label, action }) => (
              <button key={label} onClick={action} style={{
                width: 38, height: 38, borderRadius: 19,
                background: "var(--bg-elevated)", border: "0.8px solid var(--border)",
                color: "var(--text-muted)", fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* ── Needs Attention bottom banner ── */}
        {mobileAttentionOpen && needsAttention.length > 0 && (
          <>
            <div onClick={() => setMobileAttentionOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200 }} />
            <div style={{
              position: "fixed", left: 0, right: 0, bottom: 0,
              background: "var(--bg-elevated)", borderRadius: "16px 16px 0 0",
              borderTop: "1px solid var(--border)", zIndex: 201,
              padding: "16px 16px 24px",
              animation: "slideInBottom 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>Needs Attention</span>
                <button onClick={() => setMobileAttentionOpen(false)}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {attentionClusters.slice(0, 3).map(c => {
                  const attentionInCluster = nodes.filter(n =>
                    c.nodeIds.includes(n.id) && n.recall !== null && (n.recall as number) < 50
                  );
                  return (
                    <div key={c.id} style={{
                      background: "var(--bg-input)", borderRadius: 10, padding: "10px 12px",
                      border: "0.8px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)" }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)", flex: 1 }}>{c.label}</span>
                        <span style={{ fontSize: 11, color: "var(--red)" }}>{attentionInCluster.length} need review</span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {attentionInCluster.slice(0, 3).map(n => (
                          <button key={n.id}
                            onClick={() => { handleNodeSelect(n.id); setMobileAttentionOpen(false); }}
                            style={{
                              fontSize: 11, color: "var(--text-muted)", background: "var(--bg-elevated)",
                              border: "0.8px solid var(--border)", borderRadius: 6, padding: "3px 8px",
                              cursor: "pointer", fontFamily: "inherit",
                            }}
                          >{n.label}</button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => { navigate("/retest"); setMobileAttentionOpen(false); }} style={{
                display: "block", width: "100%", marginTop: 12, height: 40, borderRadius: 10,
                background: "var(--red)", border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "inherit",
              }}>Review Now</button>
            </div>
          </>
        )}

        {/* ── Mobile Concept Explorer bottom sheet (parent layer) ── */}
        {conceptLayer && !["path","explain","cluster-path"].includes(topLayer?.type ?? "") && (
          <>
            <div onClick={closeExplorerStack}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 90 }} />
            <div style={{
              position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "84vh",
              background: "var(--bg-elevated)", borderRadius: "18px 18px 0 0",
              borderTop: "1px solid var(--border)", zIndex: 100, overflowY: "auto",
              animation: "slideInBottom 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}>
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)" }} />
              </div>
              {activeConceptNode && (
                <ConceptExplorer
                  node={activeConceptNode}
                  onClose={closeExplorerStack}
                  onRetestClick={handleRetestClick}
                  onExplainClick={() => pushLayer({ type: "explain", nodeId: conceptLayer.nodeId })}
                  onPathLearnClick={() => pushLayer({ type: "path", nodeId: conceptLayer.nodeId })}
                />
              )}
            </div>
          </>
        )}

        {/* ── Mobile Cluster Explorer bottom sheet (parent layer) ── */}
        {clusterLayer && !conceptLayer && !["path","explain","cluster-path"].includes(topLayer?.type ?? "") && (
          <>
            <div onClick={closeExplorerStack}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 90 }} />
            <div style={{
              position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "84vh",
              background: "var(--bg-elevated)", borderRadius: "18px 18px 0 0",
              borderTop: "1px solid var(--border)", zIndex: 100, overflowY: "auto",
              animation: "slideInBottom 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}>
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)" }} />
              </div>
              {activeCluster && (
                <ClusterExplorer
                  cluster={activeCluster}
                  nodes={nodes}
                  onClose={closeExplorerStack}
                  onLearnCluster={() => {
                    const keyNodeId = activeCluster.keyNodeIds?.[0] ?? activeCluster.nodeIds[0];
                    const keyNode = nodes.find(n => n.id === keyNodeId);
                    if (keyNode) {
                      setSelectedNodeId(keyNode.id);
                      pushLayer({ type: "cluster-path", clusterId: clusterLayer.clusterId });
                    }
                  }}
                  onExpandCluster={() => handleClusterToggle(activeCluster.id)}
                  onFocusCluster={() => setFocusedClusterId(prev => prev === activeCluster.id ? null : activeCluster.id)}
                  onNodeSelect={(id) => {
                    setSelectedNodeId(id);
                    pushLayer({ type: "concept", nodeId: id });
                  }}
                  isExpanded={expandedClusterIds.includes(activeCluster.id)}
                  isFocused={focusedClusterId === activeCluster.id}
                />
              )}
            </div>
          </>
        )}

        {/* ── Child scrim (when child layer is active) ── */}
        {hasChild && !["path","explain","cluster-path"].includes(topLayer?.type ?? "") && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.24)", zIndex: 190 }} />
        )}

        {/* Path Learning overlay (child layer) */}
        {(topLayer?.type === "path" || topLayer?.type === "cluster-path") && pathNode && (
          <PathLearning
            node={pathNode}
            nodes={nodes}
            clusterId={pathClusterId}
            onBack={hasChild ? goBackLayer : undefined}
            onClose={closeExplorerStack}
          />
        )}

        {/* Explain overlay (child layer) */}
        {topLayer?.type === "explain" && explainNode && (
          <ExplainOverlay
            node={explainNode}
            onBack={hasChild ? goBackLayer : undefined}
            onClose={closeExplorerStack}
          />
        )}
      </div>
    );
  }

  // ─── DESKTOP LAYOUT ───────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", height: "100%", position: "relative", background: "var(--bg)" }}>
      {/* Graph — full area */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <KnowledgeGraph
          nodes={nodes}
          edges={edges}
          clusters={clusters}
          selectedNodeId={selectedNodeId}
          selectedClusterId={selectedClusterId}
          viewMode={viewMode}
          expandedClusterIds={expandedClusterIds}
          focusedClusterId={focusedClusterId}
          onNodeSelect={handleNodeSelect}
          onClusterSelect={handleClusterSelect}
          onClusterToggle={handleClusterToggle}
        />
        <GraphStateOverlay status={graphStatus} error={graphError} isEmpty={nodes.length === 0} onRetry={refreshGraph} onAddNote={() => navigate("/notes")} />

        {/* ── Stats card — top left ── */}
        <div style={{
          ...panel, borderRadius: 10, position: "absolute", top: 25, left: 24,
          display: "flex", gap: 24, alignItems: "flex-start",
          padding: "12px 18px", animation: "fadeUp 0.3s ease",
        }}>
          <StatChip value={stats.total} label="Total" color="var(--text-2)" />
          <StatChip value={stats.healthy} label="Healthy" color="var(--green)" />
          <StatChip value={stats.weakening} label="Weakening" color="var(--orange)" />
          <StatChip value={stats.review} label="Review" color="var(--red)" />
        </div>

        {/* ── Needs Attention — top right ── */}
        {needsAttention.length > 0 && !selectedNodeId && !selectedClusterId && (
          <div style={{
            ...panel, borderRadius: 12, position: "absolute", top: 25, right: 24,
            padding: "14px 16px", width: 230, animation: "fadeUp 0.3s ease",
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.6px",
              textTransform: "uppercase", color: "var(--red)", margin: 0, marginBottom: 10,
            }}>
              Needs Attention
            </p>

            {attentionClusters.slice(0, 2).map(c => {
              const attentionInCluster = nodes.filter(n =>
                c.nodeIds.includes(n.id) && n.recall !== null && (n.recall as number) < 50
              );
              return (
                <div key={c.id} style={{ marginBottom: 8 }}>
                  <button
                    onClick={() => handleClusterSelect(c.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "6px 8px", borderRadius: 6, background: "none",
                      border: "none", cursor: "pointer", fontFamily: "inherit",
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-input)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                  >
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--text-2)", flex: 1, textAlign: "left", fontWeight: 600 }}>{c.label}</span>
                    <span style={{ fontSize: 11, color: "var(--red)" }}>{attentionInCluster.length} need review</span>
                  </button>
                  {attentionInCluster.slice(0, 2).map(n => (
                    <button key={n.id}
                      onClick={() => handleNodeSelect(n.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        padding: "4px 8px 4px 22px", borderRadius: 6, background: "none",
                        border: "none", cursor: "pointer", fontFamily: "inherit",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-input)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                    >
                      <span style={{ fontSize: 11, color: "var(--text-muted)", flex: 1, textAlign: "left" }}>{n.label}</span>
                    </button>
                  ))}
                </div>
              );
            })}

            <button onClick={() => navigate("/retest")} style={{
              display: "block", width: "100%", marginTop: 10, height: 32, borderRadius: 6,
              background: "var(--red)", border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 600, color: "#fff", fontFamily: "inherit",
              transition: "opacity 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
            >
              Review Now
            </button>
          </div>
        )}

        {/* ── Top-center: VIEW mode control ── */}
        <div style={{
          position: "absolute", top: 25, left: "50%", transform: "translateX(-50%)",
          pointerEvents: "all", zIndex: 10,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}>
          <div style={{
            ...panel, borderRadius: 20, padding: "6px 8px",
            display: "flex", gap: 2, alignItems: "center",
            boxShadow: "0px 4px 12px rgba(0,0,0,0.35)",
          }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", padding: "0 6px" }}>View</span>
            {(["overview", "detailed"] as ViewMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "5px 14px", borderRadius: 14,
                  background: viewMode === mode ? "var(--blue)" : "none",
                  color: viewMode === mode ? "#fff" : "var(--text-muted)",
                  border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                  fontFamily: "inherit", transition: "all 0.15s",
                }}
              >
                {mode === "overview" ? "Overview" : "Detailed"}
              </button>
            ))}
          </div>

          {/* Focused cluster banner */}
          {focusedClusterId && (() => {
            const fc = clusters.find(c => c.id === focusedClusterId);
            return fc ? (
              <div style={{
                ...panel, borderRadius: 20, padding: "6px 14px",
                display: "flex", alignItems: "center", gap: 10,
                animation: "fadeUp 0.2s ease",
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--blue)" }}>Focus</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{fc.label}</span>
                <button
                  onClick={() => setFocusedClusterId(null)}
                  style={{
                    fontSize: 11, color: "var(--text-muted)", background: "none",
                    border: "1px solid var(--border)", borderRadius: 10,
                    padding: "2px 8px", cursor: "pointer", fontFamily: "inherit",
                  }}
                >Exit</button>
              </div>
            ) : null;
          })()}
        </div>

        {/* ── Bottom row ── */}
        <div style={{
          position: "absolute", bottom: 16, left: 0, right: 0,
          display: "flex", alignItems: "flex-end", padding: "0 24px",
          gap: 0, pointerEvents: "none",
        }}>
          {/* Legend — left */}
          <div style={{ ...panel, borderRadius: 10, padding: "10px 14px", pointerEvents: "all", flexShrink: 0 }}>
            <p style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.6px",
              textTransform: "uppercase", color: "var(--text-2)", margin: 0, marginBottom: 6,
            }}>Legend</p>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
                <circle cx="7" cy="7" r="6" fill="none" stroke="var(--text-2)" strokeWidth="1.2" />
                <circle cx="7" cy="7" r="2.5" fill="var(--text-2)" />
              </svg>
              <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Master Cluster</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-dim)", flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Concept</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <svg width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0 }} aria-hidden="true">
                <polygon points="5,0 10,5 5,10 0,5" fill="none" stroke="#a78bfa" strokeWidth="1.3" />
              </svg>
              <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Analogy</span>
            </div>
            {[
              { color: "var(--green)", label: "Healthy (75–100%)" },
              { color: "var(--orange)", label: "Weakening (50–74%)" },
              { color: "var(--red)", label: "Needs Review (<50%)" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <svg width="20" height="6" style={{ flexShrink: 0 }}>
                <line x1="0" y1="3" x2="20" y2="3" stroke="var(--border-strong)" strokeWidth="1.5" strokeDasharray="4,3" />
              </svg>
              <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>Locked prerequisite</span>
            </div>
          </div>

          {/* Search + actions — center */}
          <div style={{
            flex: 1, display: "flex", justifyContent: "center", alignItems: "center",
            gap: 8, pointerEvents: "all",
          }}>
            <div style={{ position: "relative" }}>
              <div style={{
                ...panel, borderRadius: 20,
                display: "flex", alignItems: "center", gap: 10,
                padding: "0 17px", height: 42, width: 269,
                boxShadow: "0px 4px 8px rgba(0,0,0,0.4)",
              }}>
                <img src={imgSearch} alt="" style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.6 }} />
                <input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
                  placeholder="Search concepts or clusters..."
                  style={{
                    background: "none", border: "none", outline: "none",
                    color: "var(--text)", fontSize: 13, fontFamily: "inherit", flex: 1, minWidth: 0,
                  }}
                />
              </div>
              {searchOpen && searchQuery && (
                <div style={{
                  position: "absolute", bottom: "100%", left: 0, right: 0,
                  marginBottom: 8, ...panel, borderRadius: 14,
                  overflow: "hidden", maxHeight: 280, overflowY: "auto",
                }}>
                  <MobileSearchResults
                    filteredClusters={filteredClusters}
                    filteredNodes={filteredNodes}
                    onClusterSelect={(id) => { handleClusterSelect(id); setSearchQuery(""); setSearchOpen(false); }}
                    onNodeSelect={(id) => { handleNodeSelect(id); setSearchQuery(""); setSearchOpen(false); }}
                  />
                </div>
              )}
            </div>

            {[
              { key: "notes", label: "Add Note", img: imgNotesIcon, to: "/notes" },
              { key: "retest", label: "Retest", img: imgTarget, to: "/retest" },
            ].map(({ key, label, img, to }) => (
              <div key={key} style={{ position: "relative" }}
                onMouseEnter={() => setHoveredBtn(key)}
                onMouseLeave={() => setHoveredBtn(null)}
              >
                <button onClick={() => navigate(to)} style={{
                  ...panel, borderRadius: 20, width: 42, height: 42,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", border: "0.8px solid var(--border)",
                  background: hoveredBtn === key ? "var(--bg-input)" : "var(--bg-elevated)",
                  transition: "background 0.15s",
                  boxShadow: "0px 4px 8px rgba(0,0,0,0.4)",
                }}>
                  <img src={img} alt={label} style={{ width: 18, height: 18 }} />
                </button>
                {hoveredBtn === key && (
                  <div style={{
                    position: "absolute", bottom: "100%", left: "50%",
                    transform: "translateX(-50%)", marginBottom: 8,
                    background: "var(--bg-elevated)", border: "0.8px solid var(--border)",
                    borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 600,
                    letterSpacing: "0.04em", color: "var(--text-2)", whiteSpace: "nowrap",
                    pointerEvents: "none", boxShadow: "var(--shadow)", zIndex: 100,
                    animation: "fadeIn 0.12s ease",
                  }}>{label}</div>
                )}
              </div>
            ))}
          </div>

          {/* Zoom controls — right */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, pointerEvents: "all", flexShrink: 0 }}>
            {[
              { label: "+", action: () => document.dispatchEvent(new CustomEvent("graph-zoom-in")) },
              { label: "−", action: () => document.dispatchEvent(new CustomEvent("graph-zoom-out")) },
              { label: "⊙", action: () => document.dispatchEvent(new CustomEvent("graph-zoom-reset")) },
            ].map(({ label, action }) => (
              <button key={label} onClick={action} style={{
                width: 36, height: 36, borderRadius: 20,
                background: "var(--bg-elevated)", border: "0.8px solid var(--border)",
                color: "var(--text-muted)", fontSize: 16, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-input)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
              >{label}</button>
            ))}
          </div>
        </div>

      </div>

      {/* Concept Explorer panel */}
      {conceptLayer && activeConceptNode && (
        <ConceptExplorer
          node={activeConceptNode}
          onClose={closeExplorerStack}
          onRetestClick={handleRetestClick}
          onExplainClick={() => pushLayer({ type: "explain", nodeId: conceptLayer.nodeId })}
          onPathLearnClick={() => pushLayer({ type: "path", nodeId: conceptLayer.nodeId })}
        />
      )}

      {/* Cluster Explorer panel */}
      {clusterLayer && !conceptLayer && activeCluster && (
        <ClusterExplorer
          cluster={activeCluster}
          nodes={nodes}
          onClose={closeExplorerStack}
          onLearnCluster={() => {
            const keyNodeId = activeCluster.keyNodeIds?.[0] ?? activeCluster.nodeIds[0];
            const keyNode = nodes.find(n => n.id === keyNodeId);
            if (keyNode) {
              setSelectedNodeId(keyNode.id);
              pushLayer({ type: "cluster-path", clusterId: clusterLayer.clusterId });
            }
          }}
          onExpandCluster={() => handleClusterToggle(activeCluster.id)}
          onFocusCluster={() => setFocusedClusterId(prev => prev === activeCluster.id ? null : activeCluster.id)}
          onNodeSelect={(id) => {
            setSelectedNodeId(id);
            pushLayer({ type: "concept", nodeId: id });
          }}
          isExpanded={expandedClusterIds.includes(activeCluster.id)}
          isFocused={focusedClusterId === activeCluster.id}
        />
      )}

      {/* Child scrim — semi-transparent so parent panel stays visible behind child */}
      {hasChild && (
        <div style={{ position: "fixed", inset: 0, zIndex: 190, background: "rgba(0,0,0,0.28)", backdropFilter: "blur(1px)", WebkitBackdropFilter: "blur(1px)" }} />
      )}

      {/* Explain overlay (child layer z-index 200) */}
      {topLayer?.type === "explain" && explainNode && (
        <ExplainOverlay
          node={explainNode}
          onBack={hasChild ? goBackLayer : undefined}
          onClose={closeExplorerStack}
        />
      )}

      {/* Path Learning overlay (child layer z-index 200) */}
      {(topLayer?.type === "path" || topLayer?.type === "cluster-path") && pathNode && (
        <PathLearning
          node={pathNode}
          nodes={nodes}
          clusterId={pathClusterId}
          onBack={hasChild ? goBackLayer : undefined}
          onClose={closeExplorerStack}
        />
      )}
    </div>
  )
}

// ── Shared search results component ──────────────────────────────────────────
function MobileSearchResults({
  filteredClusters, filteredNodes, onClusterSelect, onNodeSelect
}: {
  filteredClusters: MasterCluster[];
  filteredNodes: { id: string; label: string; recall: number | null }[];
  onClusterSelect: (id: string) => void;
  onNodeSelect: (id: string) => void;
}) {
  return (
    <>
      {filteredClusters.length > 0 && (
        <>
          <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>Clusters</div>
          {filteredClusters.map(c => (
            <button key={c.id}
              onMouseDown={() => onClusterSelect(c.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "7px 16px", background: "none", border: "none",
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-input)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                <circle cx="6" cy="6" r="5" fill="none" stroke="var(--text-2)" strokeWidth="1.2" />
                <circle cx="6" cy="6" r="2" fill="var(--text-2)" />
              </svg>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>{c.label}</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>{c.nodeIds.length} concepts</span>
            </button>
          ))}
        </>
      )}
      {filteredNodes.length > 0 && (
        <>
          <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>Concepts</div>
          {filteredNodes.map(n => {
            const rs = recallStatus(n.recall);
            return (
              <button key={n.id}
                onMouseDown={() => onNodeSelect(n.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "7px 16px", background: "none", border: "none",
                  cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--bg-input)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: rs.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>{n.label}</span>
                {n.recall !== null && (
                  <span style={{ fontSize: 12, color: rs.color, marginLeft: "auto" }}>{n.recall}%</span>
                )}
              </button>
            );
          })}
        </>
      )}
      {filteredNodes.length === 0 && filteredClusters.length === 0 && (
        <div style={{ padding: "10px 16px", color: "var(--text-dim)", fontSize: 13 }}>No results found</div>
      )}
    </>
  );
}

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: 16, fontWeight: 700, color, lineHeight: "24px" }}>{value}</span>
      <span style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: "15px", marginTop: 1 }}>{label}</span>
    </div>
  )
}

function MobileStatDot({ value, color }: { value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color }} />
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function GraphStateOverlay({ status, error, isEmpty, onRetry, onAddNote }: {
  status: "idle" | "loading" | "ready" | "error"
  error: string | null
  isEmpty: boolean
  onRetry: () => void
  onAddNote: () => void
}) {
  let title: string | null = null
  let body: string | null = null
  let action: { label: string; onClick: () => void } | null = null
  if (status === "loading" && isEmpty) {
    title = "Loading your Brain…"
  } else if (status === "error") {
    title = "Couldn't load your knowledge graph"
    body = error
    action = { label: "Retry", onClick: onRetry }
  } else if (status === "ready" && isEmpty) {
    title = "Your Brain is empty"
    body = "Add a note and its concepts will appear here once they're processed."
    action = { label: "Write a note", onClick: onAddNote }
  }
  if (!title) return null
  return (
    <div role="status" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5 }}>
      <div style={{ ...panel, borderRadius: 12, padding: "18px 22px", maxWidth: 340, textAlign: "center", pointerEvents: "auto" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: body ? 6 : 0 }}>{title}</div>
        {body && <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{body}</div>}
        {action && (
          <button onClick={action.onClick} style={{ marginTop: 12, background: "var(--blue)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}
