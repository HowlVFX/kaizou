import type { MasterCluster, GraphNode } from "../types"
import { recallStatus } from "../data/demo"

interface Props {
  cluster: MasterCluster
  nodes: GraphNode[]
  onClose: () => void
  onLearnCluster: () => void
  onExpandCluster: () => void
  onFocusCluster: () => void
  onNodeSelect: (id: string) => void
  isExpanded: boolean
  isFocused: boolean
}

export default function ClusterExplorer({
  cluster,
  nodes,
  onClose,
  onLearnCluster,
  onExpandCluster,
  onFocusCluster,
  onNodeSelect,
  isExpanded,
  isFocused,
}: Props) {
  const clusterNodes = nodes.filter((n) => cluster.nodeIds.includes(n.id))
  const keyNodes = cluster.keyNodeIds
    ? nodes.filter((n) => cluster.keyNodeIds!.includes(n.id))
    : clusterNodes.slice(0, 4)

  const rs = cluster.recallSummary
  const total = cluster.nodeIds.length

  const statusColor =
    cluster.status === "healthy"
      ? "var(--green)"
      : cluster.status === "needs-review"
        ? "var(--red)"
        : "var(--orange)"

  const statusLabel =
    cluster.status === "healthy"
      ? "Mostly healthy"
      : cluster.status === "needs-review"
        ? "Needs attention"
        : "Mixed health"

  return (
    <div
      style={{
        width: 340,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        animation: "fadeUp 0.22s ease",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flex: 1,
              minWidth: 0,
            }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `2px solid ${statusColor}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: statusColor,
                  }}
                />
              </div>
            </div>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-dim)",
              }}
            >
              Master Cluster
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "1px solid var(--border)",
              background: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              flexShrink: 0,
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--text)",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {cluster.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
          {total} concepts
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {/* Description */}
        {cluster.description && (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-2)",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {cluster.description}
          </p>
        )}

        {/* Status */}
        {rs && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--bg)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-dim)",
                }}
              >
                Status
              </span>
              <span
                style={{ fontSize: 11, fontWeight: 600, color: statusColor }}
              >
                {statusLabel}
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "6px 12px",
              }}
            >
              {[
                {
                  label: "Established",
                  value: rs.established,
                  color: "var(--green)",
                },
                {
                  label: "Weakening",
                  value: rs.weakening,
                  color: "var(--orange)",
                },
                {
                  label: "Need review",
                  value: rs.needsReview,
                  color: "var(--red)",
                },
                { label: "Locked", value: rs.locked, color: "var(--text-dim)" },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {value} {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key areas */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              marginBottom: 8,
            }}
          >
            Key Areas
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {keyNodes.map((n) => {
              const rs2 = recallStatus(n.recall)
              return (
                <button
                  key={n.id}
                  onClick={() => onNodeSelect(n.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 8,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border-strong)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.borderColor =
                      "var(--border)")
                  }
                >
                  {n.locked ? (
                    <span style={{ fontSize: 12, flexShrink: 0 }}>🔒</span>
                  ) : (
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: rs2.color,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <span
                    style={{ fontSize: 13, color: "var(--text-2)", flex: 1 }}
                  >
                    {n.label}
                  </span>
                  {n.recall !== null && (
                    <span
                      style={{
                        fontSize: 11,
                        color: rs2.color,
                        fontWeight: 600,
                      }}
                    >
                      {rs2.label}
                    </span>
                  )}
                </button>
              )
            })}
            {clusterNodes.length > keyNodes.length && (
              <button
                onClick={onExpandCluster}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  textAlign: "left",
                  background: "none",
                  border: "1px dashed var(--border)",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text-dim)",
                  fontFamily: "inherit",
                  transition: "color 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.color =
                    "var(--text-2)"
                  ;(e.currentTarget as HTMLElement).style.borderColor =
                    "var(--border-strong)"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.color =
                    "var(--text-dim)"
                  ;(e.currentTarget as HTMLElement).style.borderColor =
                    "var(--border)"
                }}
              >
                + {clusterNodes.length - keyNodes.length} more concepts
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={onLearnCluster}
            style={{
              padding: "11px 16px",
              borderRadius: 9,
              background: "var(--green)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              fontFamily: "inherit",
              transition: "opacity 0.15s",
              textAlign: "left",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.opacity = "0.88")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.opacity = "1")
            }
            aria-label={`Learn ${cluster.label} cluster`}
          >
            Learn This Cluster →
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onExpandCluster}
              style={{
                flex: 1,
                padding: "9px 14px",
                borderRadius: 9,
                background: isExpanded ? "var(--bg-input)" : "var(--bg)",
                color: isExpanded ? "var(--text)" : "var(--text-2)",
                border: `1px solid ${
                  isExpanded ? "var(--border-strong)" : "var(--border)"
                }`,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              aria-label={
                isExpanded
                  ? "Collapse cluster"
                  : `Expand ${cluster.label} cluster to view concepts`
              }
            >
              {isExpanded ? "▲ Collapse" : "▼ Expand Cluster"}
            </button>
            <button
              onClick={onFocusCluster}
              style={{
                flex: 1,
                padding: "9px 14px",
                borderRadius: 9,
                background: isFocused ? "rgba(28,176,246,0.12)" : "var(--bg)",
                color: isFocused ? "var(--blue)" : "var(--text-2)",
                border: `1px solid ${
                  isFocused ? "rgba(28,176,246,0.4)" : "var(--border)"
                }`,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              aria-label={
                isFocused
                  ? `Exit focus on ${cluster.label}`
                  : `Focus on ${cluster.label}`
              }
            >
              {isFocused ? "Exit Focus" : "⊙ Focus Cluster"}
            </button>
          </div>
        </div>

        {/* Grouping explanation */}
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            fontSize: 12,
            color: "var(--text-dim)",
            lineHeight: 1.6,
          }}
        >
          {total} concepts are grouped here because they form a shared{" "}
          {cluster.label.toLowerCase()} knowledge area.
        </div>
      </div>
    </div>
  )
}
