import { useState, useRef, useCallback, useEffect } from "react"
import type { GraphNode, GraphEdge, MasterCluster } from "../types"
import { recallStatus } from "../data/demo"

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  clusters: MasterCluster[]
  selectedNodeId: string | null
  selectedClusterId: string | null
  viewMode: "overview" | "detailed"
  expandedClusterIds: string[]
  focusedClusterId?: string | null
  activePathNodeIds?: string[]
  activePathEdgeIds?: string[]
  onNodeSelect: (id: string | null) => void
  onClusterSelect: (id: string | null) => void
  onClusterToggle: (id: string) => void
  highlightNew?: string[]
  compact?: boolean
}

const NODE_RADIUS = 22
const LOCKED_RADIUS = 18
const CLUSTER_RADIUS = 58

export default function KnowledgeGraph({
  nodes,
  edges,
  clusters,
  selectedNodeId,
  selectedClusterId,
  viewMode,
  expandedClusterIds,
  focusedClusterId,
  activePathNodeIds = [],
  activePathEdgeIds = [],
  onNodeSelect,
  onClusterSelect,
  onClusterToggle,
  highlightNew = [],
  compact = false,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(compact ? 0.65 : 0.85)
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const lastClickTime = useRef<Record<string, number>>({})
  const [floatOffsets] = useState(() =>
    Object.fromEntries(nodes.map((n) => [n.id, Math.random() * 2 * Math.PI])),
  )
  const [time, setTime] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTime((t) => t + 0.02), 50)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const zIn = () => setZoom((z) => Math.min(2, z * 1.15))
    const zOut = () => setZoom((z) => Math.max(0.3, z / 1.15))
    const zReset = () => {
      setPan({ x: 0, y: 0 })
      setZoom(0.85)
    }
    document.addEventListener("graph-zoom-in", zIn)
    document.addEventListener("graph-zoom-out", zOut)
    document.addEventListener("graph-zoom-reset", zReset)
    return () => {
      document.removeEventListener("graph-zoom-in", zIn)
      document.removeEventListener("graph-zoom-out", zOut)
      document.removeEventListener("graph-zoom-reset", zReset)
    }
  }, [])

  const getConnectedIds = useCallback(
    (nodeId: string) => {
      const ids = new Set<string>()
      edges.forEach((e) => {
        if (e.source === nodeId) ids.add(e.target)
        if (e.target === nodeId) ids.add(e.source)
      })
      return ids
    },
    [edges],
  )

  const connected = hoveredId
    ? getConnectedIds(hoveredId)
    : selectedNodeId
      ? getConnectedIds(selectedNodeId)
      : null
  const focusId = hoveredId || selectedNodeId

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setZoom((z) => Math.max(0.3, Math.min(2, z * factor)))
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (
        (e.target as SVGElement).closest(".graph-node") ||
        (e.target as SVGElement).closest(".cluster-node")
      )
        return
      setIsPanning(true)
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      }
    },
    [pan],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      })
    },
    [isPanning],
  )

  const handleMouseUp = useCallback(() => setIsPanning(false), [])

  // Double-click detection for cluster toggle
  const handleClusterClick = useCallback(
    (clusterId: string, isSelected: boolean) => {
      const now = Date.now()
      const last = lastClickTime.current[clusterId] ?? 0
      if (now - last < 350) {
        // Double-click: toggle expand
        onClusterToggle(clusterId)
        lastClickTime.current[clusterId] = 0
      } else {
        // Single click: select
        onClusterSelect(isSelected ? null : clusterId)
        lastClickTime.current[clusterId] = now
      }
    },
    [onClusterSelect, onClusterToggle],
  )

  // Determine which concept nodes to render based on viewMode and expanded clusters
  const visibleNodeIds = new Set<string>()
  if (viewMode === "detailed") {
    nodes.forEach((n) => visibleNodeIds.add(n.id))
  } else {
    // overview: only show concepts inside expanded clusters
    expandedClusterIds.forEach((cid) => {
      const cluster = clusters.find((c) => c.id === cid)
      if (cluster) cluster.nodeIds.forEach((id) => visibleNodeIds.add(id))
    })
    // Also show active path nodes and selected node
    activePathNodeIds.forEach((id) => visibleNodeIds.add(id))
    if (selectedNodeId) visibleNodeIds.add(selectedNodeId)
  }

  const visibleNodes = nodes.filter((n) => visibleNodeIds.has(n.id))

  const getNodeFloat = (nodeId: string) => {
    const phase = floatOffsets[nodeId] ?? 0
    return Math.sin(time + phase) * 3
  }

  const getClusterFloat = (clusterId: string) => {
    const phase = (clusterId.charCodeAt(8) ?? 0) * 0.4
    return Math.sin(time * 0.7 + phase) * 4
  }

  const getEdgeStyle = (edge: GraphEdge) => {
    const isActive =
      activePathEdgeIds.length > 0 &&
      activePathEdgeIds.includes(`${edge.source}-${edge.target}`)
    const isRelevant =
      focusId && (edge.source === focusId || edge.target === focusId)
    const sourceNode = nodes.find((n) => n.id === edge.source)
    const isLockedEdge =
      sourceNode?.locked || nodes.find((n) => n.id === edge.target)?.locked
    return {
      stroke: isActive
        ? "var(--green)"
        : isRelevant
          ? edge.type === "requires"
            ? "var(--green)"
            : "var(--blue)"
          : "var(--text-dim)",
      strokeWidth: isActive ? 2 : isRelevant ? 1.5 : 1,
      opacity:
        focusId && !isRelevant && !isActive
          ? 0.2
          : isActive
            ? 1
            : focusId && isRelevant
              ? 1
              : 0.5,
      strokeDasharray:
        edge.type === "requires" && isLockedEdge
          ? "5,4"
          : edge.type === "requires"
            ? "6,3"
            : "none",
    }
  }

  const getNodeOpacity = (node: GraphNode) => {
    if (focusedClusterId) {
      const cluster = clusters.find((c) => c.id === focusedClusterId)
      if (cluster && !cluster.nodeIds.includes(node.id)) return 0.2
    }
    if (!focusId) return 1
    if (node.id === focusId) return 1
    if (connected?.has(node.id)) return 1
    return 0.25
  }

  const getClusterOpacity = (cluster: MasterCluster) => {
    if (focusedClusterId && cluster.id !== focusedClusterId) return 0.35
    if (
      selectedClusterId &&
      cluster.id !== selectedClusterId &&
      !focusedClusterId
    )
      return 0.65
    return 1
  }

  // Cluster-level edges (show only in overview when not expanded)
  const clusterEdges: Array<{ from: MasterCluster; to: MasterCluster }> = []
  clusters.forEach((cFrom) => {
    clusters.forEach((cTo) => {
      if (cFrom.id === cTo.id) return
      const hasCrossEdge = edges.some(
        (e) =>
          cFrom.nodeIds.includes(e.source) &&
          cTo.nodeIds.includes(e.target) &&
          e.type === "requires",
      )
      if (
        hasCrossEdge &&
        !clusterEdges.find(
          (ce) => ce.from.id === cTo.id && ce.to.id === cFrom.id,
        )
      ) {
        clusterEdges.push({ from: cFrom, to: cTo })
      }
    })
  })

  const clusterStatusColor = (status?: MasterCluster["status"]) => {
    if (status === "healthy") return "var(--green)"
    if (status === "needs-review") return "var(--red)"
    return "var(--orange)"
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        cursor: isPanning ? "grabbing" : "grab",
        background: "var(--bg)",
      }}
      role="img"
      aria-label="Knowledge graph"
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ display: "block" }}
      >
        {/* Background always matches current theme */}
        <rect width="100%" height="100%" fill="var(--bg)" />
        <defs>
          <marker
            id="arrow-green"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="var(--green)" opacity="0.8" />
          </marker>
          <marker
            id="arrow-blue"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="var(--blue)" opacity="0.6" />
          </marker>
          <marker
            id="arrow-default"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path
              d="M0,0 L0,6 L8,3 z"
              fill="var(--text-dim)"
              opacity="0.6"
            />
          </marker>
          <marker
            id="arrow-cluster"
            markerWidth="8"
            markerHeight="6"
            refX="8"
            refY="3"
            orient="auto"
          >
            <path
              d="M0,0 L0,6 L8,3 z"
              fill="var(--text-dim)"
              opacity="0.5"
            />
          </marker>
          <filter id="glow-green">
            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-orange">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-cluster">
            <feGaussianBlur stdDeviation="8" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* ── Layer 1: Cluster boundaries (expanded clusters) ── */}
          {clusters
            .filter((c) => expandedClusterIds.includes(c.id))
            .map((cluster) => {
              const clusterNodes = nodes.filter((n) =>
                cluster.nodeIds.includes(n.id),
              )
              if (clusterNodes.length === 0) return null
              const xs = clusterNodes.map((n) => n.x)
              const ys = clusterNodes.map((n) => n.y)
              const minX = Math.min(...xs) - 60
              const minY = Math.min(...ys) - 50
              const maxX = Math.max(...xs) + 60
              const maxY = Math.max(...ys) + 60
              const w = maxX - minX
              const h = maxY - minY
              const color = clusterStatusColor(cluster.status)
              return (
                <g key={`boundary-${cluster.id}`}>
                  <rect
                    x={minX}
                    y={minY}
                    width={w}
                    height={h + 10}
                    rx={24}
                    ry={24}
                    fill={color}
                    fillOpacity={0.06}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="6,4"
                    opacity={0.6}
                  />
                  {/* Collapse button in boundary corner */}
                  <g
                    transform={`translate(${maxX - 30}, ${minY + 14})`}
                    style={{ cursor: "pointer" }}
                    onClick={() => onClusterToggle(cluster.id)}
                    role="button"
                    aria-label={`Collapse ${cluster.label}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onClusterToggle(cluster.id)
                      }
                    }}
                  >
                    <rect
                      x={-44}
                      y={0}
                      width={60}
                      height={18}
                      rx={9}
                      fill="var(--bg-elevated)"
                      stroke={color}
                      strokeWidth={1}
                      opacity={0.9}
                    />
                    <text
                      textAnchor="middle"
                      y={12}
                      x={-15}
                      fontSize={9}
                      fontWeight={700}
                      fill={color}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      ▲ collapse
                    </text>
                  </g>
                  <text
                    x={minX + 17}
                    y={minY + 21}
                    fontSize={10}
                    fontWeight={700}
                    fill={color}
                    opacity={0.7}
                    style={{
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    {cluster.label}
                  </text>
                </g>
              )
            })}

          {/* ── Layer 2: Cluster-level edges (overview) ── */}
          {viewMode !== "detailed" &&
            clusterEdges.map((ce, i) => {
              const fx = ce.from.x ?? 400
              const fy = ce.from.y ?? 300
              const tx = ce.to.x ?? 500
              const ty = ce.to.y ?? 300
              const dx = tx - fx
              const dy = ty - fy
              const dist = Math.sqrt(dx * dx + dy * dy) || 1
              const fromExpanded = expandedClusterIds.includes(ce.from.id)
              const toExpanded = expandedClusterIds.includes(ce.to.id)
              if (fromExpanded && toExpanded) return null
              const x1 = fx + (dx / dist) * CLUSTER_RADIUS
              const y1 = fy + (dy / dist) * CLUSTER_RADIUS
              const x2 = tx - (dx / dist) * (CLUSTER_RADIUS + 6)
              const y2 = ty - (dy / dist) * (CLUSTER_RADIUS + 6)
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="var(--text-dim)"
                  strokeWidth={1}
                  opacity={0.45}
                  strokeDasharray="4,3"
                  markerEnd="url(#arrow-cluster)"
                />
              )
            })}

          {/* ── Layer 3: Concept-level edges ── */}
          {edges.map((edge, i) => {
            const src = visibleNodes.find((n) => n.id === edge.source)
            const tgt = visibleNodes.find((n) => n.id === edge.target)
            if (!src || !tgt) return null
            const style = getEdgeStyle(edge)
            const isRelevant =
              focusId && (edge.source === focusId || edge.target === focusId)
            const isActive = activePathEdgeIds.includes(
              `${edge.source}-${edge.target}`,
            )
            const marker =
              edge.type === "requires"
                ? isRelevant || isActive
                  ? "url(#arrow-green)"
                  : "url(#arrow-default)"
                : ""
            const dx = tgt.x - src.x
            const dy = tgt.y - src.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const sr = src.locked ? LOCKED_RADIUS : NODE_RADIUS
            const tr = tgt.locked ? LOCKED_RADIUS : NODE_RADIUS
            const x1 = src.x + (dx / dist) * sr
            const y1 = src.y + (dy / dist) * sr
            const x2 = tgt.x - (dx / dist) * (tr + 6)
            const y2 = tgt.y - (dy / dist) * (tr + 6)
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                opacity={style.opacity}
                strokeDasharray={style.strokeDasharray}
                markerEnd={marker}
                style={{ transition: "opacity 0.2s, stroke 0.2s" }}
              />
            )
          })}

          {/* ── Layer 4: Cluster nodes ── */}
          {viewMode === "overview" &&
            clusters.map((cluster) => {
              if (expandedClusterIds.includes(cluster.id)) return null
              const cx = cluster.x ?? 400
              const cy = (cluster.y ?? 300) + getClusterFloat(cluster.id)
              const isSelected = cluster.id === selectedClusterId
              const isHovered = cluster.id === hoveredClusterId
              const opacity = getClusterOpacity(cluster)
              const color = clusterStatusColor(cluster.status)
              const rs = cluster.recallSummary
              const total = cluster.nodeIds.length
              return (
                <g
                  key={cluster.id}
                  className="cluster-node"
                  transform={`translate(${cx}, ${cy})`}
                  style={{
                    opacity,
                    transition: "opacity 0.3s",
                    cursor: "pointer",
                  }}
                  onClick={() => handleClusterClick(cluster.id, isSelected)}
                  onMouseEnter={() => setHoveredClusterId(cluster.id)}
                  onMouseLeave={() => setHoveredClusterId(null)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Cluster: ${cluster.label}, ${total} concepts. Press Enter to expand/collapse, Space to select.`}
                  aria-expanded={expandedClusterIds.includes(cluster.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      onClusterToggle(cluster.id)
                    } else if (e.key === " ") {
                      e.preventDefault()
                      onClusterSelect(isSelected ? null : cluster.id)
                    }
                  }}
                  onFocus={() => setHoveredClusterId(cluster.id)}
                  onBlur={() => setHoveredClusterId(null)}
                >
                  {/* Halo */}
                  <circle
                    r={CLUSTER_RADIUS + 18}
                    fill={color}
                    fillOpacity={0.08}
                    stroke={color}
                    strokeWidth={isSelected ? 1.5 : 0.5}
                    strokeDasharray={isSelected ? "none" : "6,5"}
                    opacity={isSelected ? 0.7 : 0.35}
                  />
                  {/* Outer ring (selected glow) */}
                  {isSelected && (
                    <circle
                      r={CLUSTER_RADIUS + 28}
                      fill="none"
                      stroke={color}
                      strokeWidth={1}
                      opacity={0.2}
                      style={{
                        animation: "recallPulse 2.5s ease-in-out infinite",
                      }}
                    />
                  )}
                  {/* Main body */}
                  <rect
                    x={-CLUSTER_RADIUS}
                    y={-CLUSTER_RADIUS / 1.6}
                    width={CLUSTER_RADIUS * 2}
                    height={CLUSTER_RADIUS * 1.35}
                    rx={14}
                    ry={14}
                    fill={isSelected || isHovered ? color : "var(--bg-elevated)"}
                    fillOpacity={isSelected ? 0.12 : isHovered ? 0.07 : 1}
                    stroke={isSelected || isHovered ? color : "var(--text-dim)"}
                    strokeWidth={isSelected ? 2 : 1}
                    style={{ transition: "stroke 0.2s, fill 0.2s, fill-opacity 0.2s" }}
                  />
                  {/* Cluster icon (◉) */}
                  <circle
                    cx={0}
                    cy={-14}
                    r={8}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.5}
                  />
                  <circle cx={0} cy={-14} r={3} fill={color} />
                  {/* Label */}
                  <text
                    y={4}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={700}
                    fill="var(--text)"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {cluster.label.length > 18
                      ? cluster.label.slice(0, 17) + "…"
                      : cluster.label}
                  </text>
                  {/* Stats row */}
                  <text
                    y={18}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--text-dim)"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {total} concepts
                  </text>
                  {rs && rs.needsReview > 0 && (
                    <text
                      y={30}
                      textAnchor="middle"
                      fontSize={9}
                      fill="var(--red)"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {rs.needsReview} need review
                    </text>
                  )}

                  {/* Expand button — separate click target at bottom of card */}
                  <g
                    transform={`translate(0, 42)`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onClusterToggle(cluster.id)
                    }}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={`Expand ${cluster.label}`}
                  >
                    <rect
                      x={-28}
                      y={-0}
                      width={56}
                      height={20}
                      rx={10}
                      fill={isHovered || isSelected ? color : "none"}
                      fillOpacity={isHovered || isSelected ? 0.12 : 0}
                      stroke={isHovered || isSelected ? color : "none"}
                      strokeWidth={0.8}
                      style={{ transition: "fill 0.2s, stroke 0.2s" }}
                    />
                    <text
                      textAnchor="middle"
                      y={14}
                      fontSize={8.5}
                      fill={color}
                      opacity={isHovered || isSelected ? 1 : 0.4}
                      style={{
                        pointerEvents: "none",
                        userSelect: "none",
                        transition: "opacity 0.2s",
                      }}
                    >
                      {isHovered || isSelected ? "▼ expand" : "···"}
                    </text>
                  </g>
                </g>
              )
            })}

          {/* ── Layer 5: Concept nodes ── */}
          {visibleNodes.map((node) => {
            const status = recallStatus(node.recall)
            const isSelected = node.id === selectedNodeId
            const isHovered = node.id === hoveredId
            const isNew = highlightNew.includes(node.id)
            const isActivePath = activePathNodeIds.includes(node.id)
            const opacity = getNodeOpacity(node)
            const floatY = getNodeFloat(node.id)
            const r = node.locked
              ? LOCKED_RADIUS
              : NODE_RADIUS + (isSelected ? 8 : isHovered ? 4 : 0)
            const filterAttr =
              isSelected || isNew || isActivePath
                ? node.recall !== null && node.recall >= 75
                  ? "url(#glow-green)"
                  : node.locked
                    ? "none"
                    : node.recall !== null && node.recall >= 50
                      ? "url(#glow-orange)"
                      : "url(#glow-red)"
                : "none"

            return (
              <g
                key={node.id}
                className="graph-node"
                transform={`translate(${node.x}, ${node.y + floatY})`}
                style={{
                  opacity,
                  transition: "opacity 0.25s",
                  cursor: "pointer",
                }}
                onClick={() => onNodeSelect(isSelected ? null : node.id)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                role="button"
                tabIndex={0}
                aria-label={`Concept: ${node.label}${
                  node.recall !== null ? `, ${status.label} recall` : ""
                }`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    onNodeSelect(isSelected ? null : node.id)
                  }
                }}
              >
                {/* Path highlight ring */}
                {isActivePath && (
                  <circle
                    r={r + 12}
                    fill="none"
                    stroke="var(--green)"
                    strokeWidth={1.5}
                    opacity={0.3}
                    strokeDasharray="3,3"
                    style={{ animation: "recallPulse 2s ease-in-out infinite" }}
                  />
                )}
                {/* Selection ring */}
                {isSelected && (
                  <circle
                    r={r + 8}
                    fill="none"
                    stroke={status.color}
                    strokeWidth={1.5}
                    opacity={0.4}
                    strokeDasharray="4,4"
                  />
                )}
                {/* Node body */}
                <circle
                  r={r}
                  fill={
                    node.locked
                      ? "var(--bg-elevated)"
                      : "var(--bg-card, var(--bg-elevated))"
                  }
                  stroke={
                    node.locked
                      ? "var(--text-dim)"
                      : isSelected || isHovered || isActivePath
                        ? status.color
                        : "var(--text-dim)"
                  }
                  strokeWidth={
                    isSelected ? 2 : isActivePath ? 1.5 : isHovered ? 1.5 : 1
                  }
                  filter={filterAttr}
                  style={{ transition: "r 0.15s, stroke 0.15s" }}
                />
                {/* Locked overlay */}
                {node.locked && (
                  <g transform="translate(-7,-7)">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-dim)"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </g>
                )}
                {/* Recall indicator */}
                {!node.locked && node.recall !== null && (
                  <circle
                    cx={r * 0.7}
                    cy={-r * 0.7}
                    r={5}
                    fill={status.color}
                    style={
                      node.recall < 50
                        ? { animation: "recallPulse 2s ease-in-out infinite" }
                        : {}
                    }
                  />
                )}
                {/* Label */}
                <text
                  y={r + 14}
                  textAnchor="middle"
                  fontSize={compact ? 10 : 11}
                  fontWeight={isSelected ? 600 : 500}
                  fill={isSelected ? "var(--text)" : "var(--text-2)"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {node.label}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* Keyboard hint — shown when nothing is selected */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 10,
          color: "var(--text-dim)",
          pointerEvents: "none",
          opacity: 0.5,
          whiteSpace: "nowrap",
        }}
      >
        Click to select · Double-click or Enter to expand/collapse · Space to
        select with keyboard
      </div>
    </div>
  )
}
