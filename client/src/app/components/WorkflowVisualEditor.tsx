import React, { useState, useRef, useEffect } from "react";
import * as Icons from "lucide-react";

export interface WorkflowConfig {
  statuses: string;
  transitions: string;
  initialStatus?: string;
  positions?: Record<string, { x: number; y: number; category?: string }>;
}

export interface WorkflowItem {
  _id?: string;
  name: string;
  description?: string;
  key?: string;
  status?: string;
  config?: WorkflowConfig;
}

interface WorkflowVisualEditorProps {
  workflow?: WorkflowItem;
  onSave: (data: { name: string; description: string; key?: string; config: WorkflowConfig }) => Promise<void>;
  onCancel?: () => void;
  isLeader?: boolean;
}

interface NodeData {
  id: string;
  name: string;
  x: number;
  y: number;
  category: "backlog" | "todo" | "in_progress" | "review" | "done" | "blocked";
  isInitial?: boolean;
}

interface TransitionData {
  id: string;
  from: string;
  to: string;
  label?: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  backlog: { bg: "rgba(100, 116, 139, 0.1)", border: "#64748b", text: "#94a3b8", badge: "slate" },
  todo: { bg: "rgba(59, 130, 246, 0.12)", border: "#3b82f6", text: "#60a5fa", badge: "blue" },
  in_progress: { bg: "rgba(245, 158, 11, 0.12)", border: "#f59e0b", text: "#fbbf24", badge: "amber" },
  review: { bg: "rgba(168, 85, 247, 0.12)", border: "#a855f7", text: "#c084fc", badge: "purple" },
  done: { bg: "rgba(16, 185, 129, 0.12)", border: "#10b981", text: "#34d399", badge: "emerald" },
  blocked: { bg: "rgba(239, 68, 68, 0.12)", border: "#ef4444", text: "#f87171", badge: "rose" },
};

const PRESET_WORKFLOWS = [
  {
    name: "Standard Software Workflow",
    description: "Classic Jira software development workflow with code review",
    nodes: [
      { id: "Backlog", name: "Backlog", x: 60, y: 180, category: "backlog" as const },
      { id: "To Do", name: "To Do", x: 280, y: 180, category: "todo" as const, isInitial: true },
      { id: "In Progress", name: "In Progress", x: 500, y: 180, category: "in_progress" as const },
      { id: "In Review", name: "In Review", x: 720, y: 180, category: "review" as const },
      { id: "Done", name: "Done", x: 940, y: 180, category: "done" as const },
    ],
    transitions: [
      { id: "Backlog-To Do", from: "Backlog", to: "To Do" },
      { id: "To Do-In Progress", from: "To Do", to: "In Progress" },
      { id: "In Progress-In Review", from: "In Progress", to: "In Review" },
      { id: "In Review-Done", from: "In Review", to: "Done" },
      { id: "In Review-In Progress", from: "In Review", to: "In Progress" },
      { id: "In Progress-To Do", from: "In Progress", to: "To Do" },
    ],
  },
  {
    name: "Simple Kanban Workflow",
    description: "Streamlined 3-stage board workflow for continuous delivery",
    nodes: [
      { id: "To Do", name: "To Do", x: 100, y: 180, category: "todo" as const, isInitial: true },
      { id: "In Progress", name: "In Progress", x: 420, y: 180, category: "in_progress" as const },
      { id: "Done", name: "Done", x: 740, y: 180, category: "done" as const },
    ],
    transitions: [
      { id: "To Do-In Progress", from: "To Do", to: "In Progress" },
      { id: "In Progress-Done", from: "In Progress", to: "Done" },
      { id: "In Progress-To Do", from: "In Progress", to: "To Do" },
    ],
  },
  {
    name: "Strict QA & Release Workflow",
    description: "High-compliance workflow with mandatory QA verification & staging",
    nodes: [
      { id: "Open", name: "Open", x: 60, y: 120, category: "todo" as const, isInitial: true },
      { id: "In Dev", name: "In Dev", x: 280, y: 120, category: "in_progress" as const },
      { id: "QA Ready", name: "QA Ready", x: 500, y: 120, category: "review" as const },
      { id: "In QA", name: "In QA", x: 720, y: 120, category: "review" as const },
      { id: "Blocked", name: "Blocked", x: 500, y: 320, category: "blocked" as const },
      { id: "Closed", name: "Closed", x: 940, y: 120, category: "done" as const },
    ],
    transitions: [
      { id: "Open-In Dev", from: "Open", to: "In Dev" },
      { id: "In Dev-QA Ready", from: "In Dev", to: "QA Ready" },
      { id: "QA Ready-In QA", from: "QA Ready", to: "In QA" },
      { id: "In QA-Closed", from: "In QA", to: "Closed" },
      { id: "In QA-In Dev", from: "In QA", to: "In Dev" },
      { id: "In Dev-Blocked", from: "In Dev", to: "Blocked" },
      { id: "Blocked-In Dev", from: "Blocked", to: "In Dev" },
    ],
  },
];

export function WorkflowVisualEditor({
  workflow,
  onSave,
  onCancel,
  isLeader = true,
}: WorkflowVisualEditorProps) {
  const [name, setName] = useState(workflow?.name || "New Workflow");
  const [description, setDescription] = useState(workflow?.description || "");
  const [key, setKey] = useState(workflow?.key || "");

  // Canvas State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Nodes & Transitions State
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [transitions, setTransitions] = useState<TransitionData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);

  // Dragging Node state
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Connecting transition state
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Modals / Dropdowns
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusCategory, setNewStatusCategory] = useState<NodeData["category"]>("todo");
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Initialize nodes and transitions from workflow prop
  useEffect(() => {
    const rawStatuses = (workflow?.config?.statuses || "Backlog, To Do, In Progress, In Review, Done")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const positions = workflow?.config?.positions || {};
    const initialStatus = workflow?.config?.initialStatus || rawStatuses[1] || rawStatuses[0] || "To Do";

    const parsedNodes: NodeData[] = rawStatuses.map((statusName, idx) => {
      const savedPos = positions[statusName];
      let cat: NodeData["category"] = "todo";
      const lower = statusName.toLowerCase();
      if (lower.includes("backlog")) cat = "backlog";
      else if (lower.includes("progress") || lower.includes("dev")) cat = "in_progress";
      else if (lower.includes("review") || lower.includes("qa") || lower.includes("test")) cat = "review";
      else if (lower.includes("done") || lower.includes("close") || lower.includes("resolve")) cat = "done";
      else if (lower.includes("block") || lower.includes("cancel")) cat = "blocked";

      return {
        id: statusName,
        name: statusName,
        x: savedPos?.x ?? 80 + (idx % 4) * 220,
        y: savedPos?.y ?? 150 + Math.floor(idx / 4) * 160,
        category: (savedPos?.category as any) || cat,
        isInitial: statusName.toLowerCase() === initialStatus.toLowerCase(),
      };
    });

    setNodes(parsedNodes);

    // Transitions
    const rawTransitions = (workflow?.config?.transitions || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const parsedTransitions: TransitionData[] = [];
    rawTransitions.forEach((tStr, idx) => {
      const parts = tStr.split(">").map((p) => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        parsedTransitions.push({
          id: `${parts[0]}-${parts[1]}-${idx}`,
          from: parts[0],
          to: parts[1],
        });
      }
    });

    // If no transitions existed, create sensible default chain
    if (parsedTransitions.length === 0 && parsedNodes.length > 1) {
      for (let i = 0; i < parsedNodes.length - 1; i++) {
        parsedTransitions.push({
          id: `${parsedNodes[i].id}-${parsedNodes[i + 1].id}`,
          from: parsedNodes[i].id,
          to: parsedNodes[i + 1].id,
        });
      }
    }

    setTransitions(parsedTransitions);
  }, [workflow]);

  // Handle canvas Mouse Move for node dragging and connecting
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - pan.x) / zoom;
    const canvasY = (e.clientY - rect.top - pan.y) / zoom;

    setMousePos({ x: canvasX, y: canvasY });

    if (draggingNodeId) {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id === draggingNodeId) {
            return {
              ...n,
              x: Math.max(20, Math.round(canvasX - dragOffset.x)),
              y: Math.max(20, Math.round(canvasY - dragOffset.y)),
            };
          }
          return n;
        })
      );
    } else if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setDraggingNodeId(null);
    setConnectingFromId(null);
    setIsPanning(false);
  };

  // Node Drag Start
  const startDragNode = (e: React.MouseEvent, node: NodeData) => {
    e.stopPropagation();
    if (!isLeader) return;
    setSelectedNodeId(node.id);
    setSelectedTransitionId(null);
    setDraggingNodeId(node.id);

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - pan.x) / zoom;
    const canvasY = (e.clientY - rect.top - pan.y) / zoom;

    setDragOffset({
      x: canvasX - node.x,
      y: canvasY - node.y,
    });
  };

  // Connection Drag Start from right handle
  const startConnect = (e: React.MouseEvent, node: NodeData) => {
    e.stopPropagation();
    if (!isLeader) return;
    setConnectingFromId(node.id);
  };

  // Connection Drag Release on target node
  const endConnect = (e: React.MouseEvent, targetNode: NodeData) => {
    e.stopPropagation();
    if (connectingFromId && connectingFromId !== targetNode.id) {
      const exists = transitions.some(
        (t) => t.from === connectingFromId && t.to === targetNode.id
      );
      if (!exists) {
        setTransitions((prev) => [
          ...prev,
          {
            id: `${connectingFromId}-${targetNode.id}-${Date.now()}`,
            from: connectingFromId,
            to: targetNode.id,
          },
        ]);
      }
    }
    setConnectingFromId(null);
  };

  // Canvas Pan Start
  const startPan = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current || (e.target as HTMLElement).tagName === "svg") {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      setSelectedNodeId(null);
      setSelectedTransitionId(null);
    }
  };

  // Add Status Node
  const handleAddStatus = () => {
    if (!newStatusName.trim()) return;
    const cleanName = newStatusName.trim();
    if (nodes.some((n) => n.id.toLowerCase() === cleanName.toLowerCase())) {
      alert("A status with this name already exists.");
      return;
    }

    const newNode: NodeData = {
      id: cleanName,
      name: cleanName,
      x: 180 + Math.random() * 200,
      y: 180 + Math.random() * 100,
      category: newStatusCategory,
      isInitial: nodes.length === 0,
    };

    setNodes((prev) => [...prev, newNode]);
    setNewStatusName("");
    setShowAddModal(false);
  };

  // Remove Node
  const removeNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setTransitions((prev) => prev.filter((t) => t.from !== nodeId && t.to !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  // Toggle Initial Status
  const setInitialStatus = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        isInitial: n.id === nodeId,
      }))
    );
  };

  // Load Preset
  const applyPreset = (preset: typeof PRESET_WORKFLOWS[0]) => {
    setNodes(preset.nodes);
    setTransitions(preset.transitions);
    setName(preset.name);
    setDescription(preset.description);
  };

  // Save Workflow
  const handleSave = async () => {
    if (!name.trim()) {
      alert("Please enter a workflow name.");
      return;
    }
    if (nodes.length === 0) {
      alert("Workflow must have at least one status.");
      return;
    }

    setSaving(true);
    try {
      const statusesStr = nodes.map((n) => n.name).join(", ");
      const transitionsStr = transitions.map((t) => `${t.from} > ${t.to}`).join(", ");
      const initialNode = nodes.find((n) => n.isInitial) || nodes[0];

      const positionsMap: Record<string, { x: number; y: number; category: string }> = {};
      nodes.forEach((n) => {
        positionsMap[n.name] = { x: n.x, y: n.y, category: n.category };
      });

      const configData: WorkflowConfig = {
        statuses: statusesStr,
        transitions: transitionsStr,
        initialStatus: initialNode ? initialNode.name : undefined,
        positions: positionsMap,
      };

      await onSave({
        name: name.trim(),
        description: description.trim(),
        key: key.trim() || undefined,
        config: configData,
      });
    } finally {
      setSaving(false);
    }
  };

  // Calculate SVG curve path between two nodes
  const getNodeCenter = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    return {
      x: node.x + 85, // half of node width (170px)
      y: node.y + 40, // half of node height (80px)
    };
  };

  return (
    <div className="workflow-editor-container">
      {/* Top Controls Bar */}
      <div className="workflow-editor-header card card-sm">
        <div className="workflow-header-inputs">
          <div className="form-group inline">
            <label>Name</label>
            <input
              type="text"
              className="input-text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Software Delivery Workflow"
              disabled={!isLeader}
            />
          </div>
          <div className="form-group inline flex-grow">
            <label>Description</label>
            <input
              type="text"
              className="input-text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of workflow lifecycle..."
              disabled={!isLeader}
            />
          </div>
        </div>

        <div className="workflow-header-actions">
          {onCancel && (
            <button className="btn outline" onClick={onCancel}>
              Cancel
            </button>
          )}
          {isLeader && (
            <button className="btn primary" onClick={handleSave} disabled={saving}>
              <Icons.Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Workflow"}
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Work Area */}
      <div className="workflow-visual-body">
        {/* Left Toolbar / Presets Sidebar */}
        <aside className="workflow-sidebar card">
          <div className="sidebar-section">
            <h4>
              <Icons.Sparkles className="w-4 h-4 text-purple" /> Workflow Presets
            </h4>
            <p className="sub-text">Apply pre-configured status schemes</p>
            <div className="presets-list">
              {PRESET_WORKFLOWS.map((preset) => (
                <button
                  key={preset.name}
                  className="preset-btn"
                  onClick={() => applyPreset(preset)}
                  disabled={!isLeader}
                >
                  <b>{preset.name}</b>
                  <small>{preset.nodes.length} statuses • {preset.transitions.length} transitions</small>
                </button>
              ))}
            </div>
          </div>

          <hr className="divider" />

          <div className="sidebar-section">
            <div className="flex-between">
              <h4>
                <Icons.Layers className="w-4 h-4" /> Status Palette
              </h4>
              {isLeader && (
                <button className="btn icon-btn" onClick={() => setShowAddModal(true)}>
                  <Icons.Plus className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="sub-text">Drag or add status steps to canvas</p>

            <div className="palette-statuses">
              {nodes.map((node) => {
                const style = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.todo;
                return (
                  <div
                    key={node.id}
                    className={`palette-item ${selectedNodeId === node.id ? "selected" : ""}`}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{ borderColor: style.border }}
                  >
                    <span className="status-dot" style={{ backgroundColor: style.border }} />
                    <span className="status-name">{node.name}</span>
                    {node.isInitial && <span className="initial-pill">Initial</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <hr className="divider" />

          <div className="sidebar-section">
            <h4>Instructions</h4>
            <ul className="help-tips">
              <li><Icons.Move className="w-3 h-3" /> Drag status cards to arrange layout</li>
              <li><Icons.Link className="w-3 h-3" /> Drag from <b>● Right Handle</b> to another status to create transition</li>
              <li><Icons.Trash2 className="w-3 h-3" /> Click transition arrow to select and delete</li>
            </ul>
          </div>
        </aside>

        {/* Canvas Visual Area */}
        <div
          className={`workflow-canvas ${isPanning ? "panning" : ""}`}
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseDown={startPan}
        >
          {/* Canvas Floating Controls */}
          <div className="canvas-floating-controls">
            <button className="btn icon-btn shadow" title="Zoom In" onClick={() => setZoom((z) => Math.min(2, z + 0.15))}>
              <Icons.ZoomIn className="w-4 h-4" />
            </button>
            <button className="btn icon-btn shadow" title="Zoom Out" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}>
              <Icons.ZoomOut className="w-4 h-4" />
            </button>
            <button className="btn icon-btn shadow" title="Reset View" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
              <Icons.Maximize2 className="w-4 h-4" />
            </button>
            {isLeader && (
              <button className="btn sm primary shadow" onClick={() => setShowAddModal(true)}>
                <Icons.Plus className="w-4 h-4" /> Add Status Node
              </button>
            )}
          </div>

          {/* SVG Overlay for Connections */}
          <div
            className="canvas-transform-wrapper"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg className="workflow-svg-layer">
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="var(--brand-purple, #8b5cf6)" />
                </marker>
                <marker
                  id="arrowhead-selected"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
                </marker>
              </defs>

              {/* Render Transition Arrows */}
              {transitions.map((trans) => {
                const fromCenter = getNodeCenter(trans.from);
                const toCenter = getNodeCenter(trans.to);
                const isSelected = selectedTransitionId === trans.id;

                if (fromCenter.x === 0 || toCenter.x === 0) return null;

                // Bezier Curve
                const dx = toCenter.x - fromCenter.x;
                const dy = toCenter.y - fromCenter.y;
                const cx1 = fromCenter.x + dx * 0.4;
                const cy1 = fromCenter.y + dy * 0.1;
                const cx2 = fromCenter.x + dx * 0.6;
                const cy2 = toCenter.y - dy * 0.1;

                const pathData = `M ${fromCenter.x} ${fromCenter.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toCenter.x} ${toCenter.y}`;
                const midX = (fromCenter.x + toCenter.x) / 2;
                const midY = (fromCenter.y + toCenter.y) / 2;

                return (
                  <g key={trans.id} className="transition-group">
                    <path
                      d={pathData}
                      className={`transition-line ${isSelected ? "selected" : ""}`}
                      markerEnd={isSelected ? "url(#arrowhead-selected)" : "url(#arrowhead)"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTransitionId(trans.id);
                        setSelectedNodeId(null);
                      }}
                    />
                    {/* Hover clickable wider target line */}
                    <path
                      d={pathData}
                      className="transition-hitbox"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTransitionId(trans.id);
                        setSelectedNodeId(null);
                      }}
                    />
                    {/* Transition Label / Delete Badge */}
                    <foreignObject x={midX - 25} y={midY - 14} width="50" height="28">
                      <div
                        className={`transition-badge ${isSelected ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelected && isLeader) {
                            setTransitions((prev) => prev.filter((t) => t.id !== trans.id));
                            setSelectedTransitionId(null);
                          } else {
                            setSelectedTransitionId(trans.id);
                          }
                        }}
                        title={isSelected ? "Click again to delete transition" : "Click to select"}
                      >
                        {isSelected ? <Icons.Trash2 className="w-3 h-3 text-red" /> : <Icons.ArrowRight className="w-3 h-3" />}
                      </div>
                    </foreignObject>
                  </g>
                );
              })}

              {/* Connection Drag Preview Line */}
              {connectingFromId && (() => {
                const fromCenter = getNodeCenter(connectingFromId);
                return (
                  <line
                    x1={fromCenter.x}
                    y1={fromCenter.y}
                    x2={mousePos.x}
                    y2={mousePos.y}
                    className="connecting-line-preview"
                    strokeDasharray="5,5"
                  />
                );
              })()}
            </svg>

            {/* Render Status Nodes */}
            {nodes.map((node) => {
              const catStyle = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.todo;
              const isSelected = selectedNodeId === node.id;

              return (
                <div
                  key={node.id}
                  className={`status-node-card ${isSelected ? "selected" : ""} ${node.isInitial ? "initial" : ""}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    borderColor: isSelected ? "var(--brand-purple)" : catStyle.border,
                    backgroundColor: "var(--surface-card, #1e293b)",
                  }}
                  onMouseDown={(e) => startDragNode(e, node)}
                  onMouseUp={(e) => endConnect(e, node)}
                >
                  {/* Category Pill & Initial Indicator */}
                  <div className="node-header flex-between">
                    <span className="category-badge" style={{ backgroundColor: catStyle.bg, color: catStyle.text }}>
                      {node.category.replace("_", " ")}
                    </span>
                    {node.isInitial && (
                      <span className="initial-indicator" title="Initial ticket entry status">
                        <Icons.PlayCircle className="w-3 h-3 text-blue" /> Start
                      </span>
                    )}
                  </div>

                  {/* Node Title */}
                  <div className="node-body">
                    <b className="status-title">{node.name}</b>
                  </div>

                  {/* Node Quick Actions */}
                  {isLeader && isSelected && (
                    <div className="node-actions flex-between" onClick={(e) => e.stopPropagation()}>
                      {!node.isInitial && (
                        <button
                          className="btn text-btn sm"
                          onClick={() => setInitialStatus(node.id)}
                          title="Set as starting status"
                        >
                          Set Initial
                        </button>
                      )}
                      <button
                        className="btn text-btn danger sm"
                        onClick={() => removeNode(node.id)}
                        title="Delete status node"
                      >
                        Delete
                      </button>
                    </div>
                  )}

                  {/* Output Connector Handle (Right Dot) */}
                  {isLeader && (
                    <div
                      className="node-connector right-connector"
                      onMouseDown={(e) => startConnect(e, node)}
                      title="Drag to another node to create transition"
                    >
                      <span className="connector-dot" />
                    </div>
                  )}
                  {/* Input Connector Target Handle (Left Dot) */}
                  <div className="node-connector left-connector">
                    <span className="connector-dot" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Add Status Node Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-content card">
            <h3>Add New Status Step</h3>
            <div className="form-group margin-top">
              <label>Status Name</label>
              <input
                type="text"
                className="input-text"
                value={newStatusName}
                onChange={(e) => setNewStatusName(e.target.value)}
                placeholder="e.g. Under Audit, Code Review"
                autoFocus
              />
            </div>
            <div className="form-group margin-top">
              <label>Category Type</label>
              <select
                className="input-select"
                value={newStatusCategory}
                onChange={(e) => setNewStatusCategory(e.target.value as any)}
              >
                <option value="backlog">Backlog / Queue</option>
                <option value="todo">To Do / Open</option>
                <option value="in_progress">In Progress / Active</option>
                <option value="review">In Review / Testing</option>
                <option value="done">Done / Completed</option>
                <option value="blocked">Blocked / Cancelled</option>
              </select>
            </div>
            <div className="modal-actions flex-end margin-top gap">
              <button className="btn outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={handleAddStatus}>
                Add Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
