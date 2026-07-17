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

export interface NodeData {
  id: string;
  name: string;
  x: number;
  y: number;
  category: "backlog" | "todo" | "in_progress" | "review" | "done" | "blocked";
  isInitial?: boolean;
}

export interface TransitionData {
  id: string;
  from: string;
  to: string;
  label?: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  backlog: { bg: "rgba(100, 116, 139, 0.12)", border: "#64748b", text: "#94a3b8", badge: "slate" },
  todo: { bg: "rgba(59, 130, 246, 0.12)", border: "#3b82f6", text: "#60a5fa", badge: "blue" },
  in_progress: { bg: "rgba(245, 158, 11, 0.12)", border: "#f59e0b", text: "#fbbf24", badge: "amber" },
  review: { bg: "rgba(168, 85, 247, 0.12)", border: "#a855f7", text: "#c084fc", badge: "purple" },
  done: { bg: "rgba(16, 185, 129, 0.12)", border: "#10b981", text: "#34d399", badge: "emerald" },
  blocked: { bg: "rgba(239, 68, 68, 0.12)", border: "#ef4444", text: "#f87171", badge: "rose" },
};

const CATEGORY_ORDER: Record<string, number> = {
  backlog: 0,
  todo: 1,
  in_progress: 2,
  review: 3,
  done: 4,
  blocked: 5,
};

const PRESET_WORKFLOWS = [
  {
    name: "Standard Software Workflow",
    description: "Classic Jira software development workflow with code review & QA",
    nodes: [
      { id: "Backlog", name: "Backlog", x: 60, y: 180, category: "backlog" as const },
      { id: "To Do", name: "To Do", x: 280, y: 180, category: "todo" as const, isInitial: true },
      { id: "In Progress", name: "In Progress", x: 500, y: 180, category: "in_progress" as const },
      { id: "In Review", name: "In Review", x: 720, y: 180, category: "review" as const },
      { id: "Done", name: "Done", x: 940, y: 180, category: "done" as const },
    ],
    transitions: [
      { id: "Backlog-To Do", from: "Backlog", to: "To Do", label: "Prioritize" },
      { id: "To Do-In Progress", from: "To Do", to: "In Progress", label: "Start Dev" },
      { id: "In Progress-In Review", from: "In Progress", to: "In Review", label: "Code Review" },
      { id: "In Review-Done", from: "In Review", to: "Done", label: "Approve & Merge" },
      { id: "In Review-In Progress", from: "In Review", to: "In Progress", label: "Request Fixes" },
      { id: "In Progress-To Do", from: "In Progress", to: "To Do", label: "Unassign" },
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
      { id: "To Do-In Progress", from: "To Do", to: "In Progress", label: "Start" },
      { id: "In Progress-Done", from: "In Progress", to: "Done", label: "Complete" },
      { id: "In Progress-To Do", from: "In Progress", to: "To Do", label: "Move Back" },
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
      { id: "Open-In Dev", from: "Open", to: "In Dev", label: "Assign Dev" },
      { id: "In Dev-QA Ready", from: "In Dev", to: "QA Ready", label: "PR Opened" },
      { id: "QA Ready-In QA", from: "QA Ready", to: "In QA", label: "Begin QA" },
      { id: "In QA-Closed", from: "In QA", to: "Closed", label: "Pass Audit" },
      { id: "In QA-In Dev", from: "In QA", to: "In Dev", label: "Reject QA" },
      { id: "In Dev-Blocked", from: "In Dev", to: "Blocked", label: "Flag Impediment" },
      { id: "Blocked-In Dev", from: "Blocked", to: "In Dev", label: "Resolve Block" },
    ],
  },
  {
    name: "Support SLA Workflow",
    description: "Customer service escalation flow with triage and resolution steps",
    nodes: [
      { id: "New Intake", name: "New Intake", x: 60, y: 180, category: "todo" as const, isInitial: true },
      { id: "Triage", name: "Triage", x: 280, y: 180, category: "in_progress" as const },
      { id: "Investigating", name: "Investigating", x: 500, y: 180, category: "in_progress" as const },
      { id: "Pending Customer", name: "Pending Customer", x: 500, y: 340, category: "review" as const },
      { id: "Resolved", name: "Resolved", x: 740, y: 180, category: "done" as const },
    ],
    transitions: [
      { id: "New Intake-Triage", from: "New Intake", to: "Triage", label: "Acknowledge" },
      { id: "Triage-Investigating", from: "Triage", to: "Investigating", label: "Investigate" },
      { id: "Investigating-Pending Customer", from: "Investigating", to: "Pending Customer", label: "Need Info" },
      { id: "Pending Customer-Investigating", from: "Pending Customer", to: "Investigating", label: "Reply Received" },
      { id: "Investigating-Resolved", from: "Investigating", to: "Resolved", label: "Fix Confirmed" },
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

  // Editor View Mode: "builder" (UI No Drag-Drop), "canvas" (Interactive Diagram), "matrix" (Transition Grid)
  const [editorMode, setEditorMode] = useState<"builder" | "canvas" | "matrix">("builder");

  // Canvas State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [enableDragDrop, setEnableDragDrop] = useState(false);

  // Nodes & Transitions State
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [transitions, setTransitions] = useState<TransitionData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);

  // Dragging Node state (active only when enableDragDrop is true)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Direct transition adder inputs in UI Builder
  const [quickFrom, setQuickFrom] = useState<string>("");
  const [quickTo, setQuickTo] = useState<string>("");
  const [quickLabel, setQuickLabel] = useState<string>("");

  // Modals / Dropdowns
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNode, setEditingNode] = useState<NodeData | null>(null);
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
        x: savedPos?.x ?? 80 + (idx % 5) * 220,
        y: savedPos?.y ?? 180 + Math.floor(idx / 5) * 160,
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
      let label: string | undefined = undefined;
      let cleanStr = tStr;
      if (tStr.includes("(") && tStr.endsWith(")")) {
        const parts = tStr.split("(");
        cleanStr = parts[0].trim();
        label = parts[1].replace(")", "").trim();
      }

      const parts = cleanStr.split(">").map((p) => p.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        parsedTransitions.push({
          id: `${parts[0]}-${parts[1]}-${idx}`,
          from: parts[0],
          to: parts[1],
          label,
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

  // Set default quick form selectors when nodes change
  useEffect(() => {
    if (nodes.length > 0) {
      if (!quickFrom || !nodes.some((n) => n.id === quickFrom)) {
        setQuickFrom(nodes[0].id);
      }
      if (!quickTo || !nodes.some((n) => n.id === quickTo)) {
        setQuickTo(nodes[1]?.id || nodes[0].id);
      }
    }
  }, [nodes]);

  // Auto-arrange node locations into clean grid by category order
  const autoArrangeNodes = () => {
    const sorted = [...nodes].sort(
      (a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
    );

    const categoryGroups: Record<string, NodeData[]> = {};
    sorted.forEach((n) => {
      categoryGroups[n.category] = categoryGroups[n.category] || [];
      categoryGroups[n.category].push(n);
    });

    let currentX = 60;
    const arrangedNodes: NodeData[] = [];

    Object.keys(CATEGORY_ORDER).forEach((cat) => {
      const group = categoryGroups[cat] || [];
      group.forEach((node, rowIdx) => {
        arrangedNodes.push({
          ...node,
          x: currentX,
          y: 160 + rowIdx * 140,
        });
      });
      if (group.length > 0) {
        currentX += 230;
      }
    });

    setNodes(arrangedNodes);
  };

  // Re-order nodes in array (move left/right in UI pipeline)
  const moveNodeOrder = (index: number, direction: "prev" | "next") => {
    const targetIdx = direction === "prev" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= nodes.length) return;

    const newNodes = [...nodes];
    const temp = newNodes[index];
    newNodes[index] = newNodes[targetIdx];
    newNodes[targetIdx] = temp;

    // Recalculate horizontal positions
    newNodes.forEach((n, idx) => {
      n.x = 60 + (idx % 5) * 220;
      n.y = 160 + Math.floor(idx / 5) * 160;
    });

    setNodes(newNodes);
  };

  // Connect transition via UI form
  const handleAddTransition = () => {
    if (!quickFrom || !quickTo) return;
    if (quickFrom === quickTo) {
      alert("Source and target status cannot be identical.");
      return;
    }
    const exists = transitions.some((t) => t.from === quickFrom && t.to === quickTo);
    if (exists) {
      alert(`Transition from "${quickFrom}" to "${quickTo}" already exists.`);
      return;
    }

    setTransitions((prev) => [
      ...prev,
      {
        id: `${quickFrom}-${quickTo}-${Date.now()}`,
        from: quickFrom,
        to: quickTo,
        label: quickLabel.trim() || undefined,
      },
    ]);

    setQuickLabel("");
  };

  // Batch action: Auto-connect all statuses sequentially
  const handleConnectSequential = () => {
    const newTrans: TransitionData[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const from = nodes[i].id;
      const to = nodes[i + 1].id;
      if (!transitions.some((t) => t.from === from && t.to === to)) {
        newTrans.push({
          id: `${from}-${to}-${Date.now()}-${i}`,
          from,
          to,
        });
      }
    }
    setTransitions((prev) => [...prev, ...newTrans]);
  };

  // Batch action: Allow all statuses to transition to Done status
  const handleAllowAllToDone = () => {
    const doneNode = nodes.find((n) => n.category === "done") || nodes[nodes.length - 1];
    if (!doneNode) return;

    const newTrans: TransitionData[] = [];
    nodes.forEach((n) => {
      if (n.id !== doneNode.id) {
        if (!transitions.some((t) => t.from === n.id && t.to === doneNode.id)) {
          newTrans.push({
            id: `${n.id}-${doneNode.id}-${Date.now()}`,
            from: n.id,
            to: doneNode.id,
            label: "Complete Ticket",
          });
        }
      }
    });

    setTransitions((prev) => [...prev, ...newTrans]);
  };

  // Toggle single cell transition in Matrix Mode
  const toggleMatrixTransition = (fromId: string, toId: string) => {
    if (!isLeader || fromId === toId) return;
    const existing = transitions.find((t) => t.from === fromId && t.to === toId);

    if (existing) {
      setTransitions((prev) => prev.filter((t) => t.id !== existing.id));
    } else {
      setTransitions((prev) => [
        ...prev,
        {
          id: `${fromId}-${toId}-${Date.now()}`,
          from: fromId,
          to: toId,
        },
      ]);
    }
  };

  // Canvas mouse handlers (for optional panning/dragging)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left - pan.x) / zoom;
    const canvasY = (e.clientY - rect.top - pan.y) / zoom;

    if (draggingNodeId && enableDragDrop) {
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
    setIsPanning(false);
  };

  const startDragNode = (e: React.MouseEvent, node: NodeData) => {
    if (!isLeader) return;
    setSelectedNodeId(node.id);
    setSelectedTransitionId(null);

    if (enableDragDrop) {
      e.stopPropagation();
      setDraggingNodeId(node.id);
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left - pan.x) / zoom;
      const canvasY = (e.clientY - rect.top - pan.y) / zoom;
      setDragOffset({ x: canvasX - node.x, y: canvasY - node.y });
    }
  };

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

    const idx = nodes.length;
    const newNode: NodeData = {
      id: cleanName,
      name: cleanName,
      x: 60 + (idx % 5) * 220,
      y: 160 + Math.floor(idx / 5) * 160,
      category: newStatusCategory,
      isInitial: nodes.length === 0,
    };

    setNodes((prev) => [...prev, newNode]);
    setNewStatusName("");
    setShowAddModal(false);
  };

  // Update existing status node
  const handleUpdateStatus = () => {
    if (!editingNode || !editingNode.name.trim()) return;
    const cleanName = editingNode.name.trim();

    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === editingNode.id) {
          return {
            ...n,
            id: cleanName,
            name: cleanName,
            category: editingNode.category,
            isInitial: editingNode.isInitial,
          };
        }
        return n;
      })
    );

    // Update references in transitions if ID changed
    if (editingNode.id !== cleanName) {
      setTransitions((prev) =>
        prev.map((t) => ({
          ...t,
          from: t.from === editingNode.id ? cleanName : t.from,
          to: t.to === editingNode.id ? cleanName : t.to,
        }))
      );
    }

    setEditingNode(null);
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
  const applyPreset = (preset: (typeof PRESET_WORKFLOWS)[0]) => {
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
      const transitionsStr = transitions
        .map((t) => (t.label ? `${t.from} > ${t.to} (${t.label})` : `${t.from} > ${t.to}`))
        .join(", ");
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
      x: node.x + 85,
      y: node.y + 40,
    };
  };

  return (
    <div className="workflow-editor-container">
      {/* Top Header & Navigation Bar */}
      <div className="workflow-editor-header card card-sm">
        <div className="workflow-header-inputs">
          <div className="form-group inline">
            <label>Workflow Name</label>
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

      {/* Editor View Mode Switcher */}
      <div className="workflow-mode-bar flex-between card card-sm">
        <div className="btn-group">
          <button
            className={`btn sm ${editorMode === "builder" ? "primary" : "ghost"}`}
            onClick={() => setEditorMode("builder")}
          >
            <Icons.Sliders className="w-4 h-4" /> ⚡ UI Step Builder (No Drag-Drop)
          </button>
          <button
            className={`btn sm ${editorMode === "canvas" ? "primary" : "ghost"}`}
            onClick={() => setEditorMode("canvas")}
          >
            <Icons.GitBranch className="w-4 h-4" /> 🎨 Interactive Diagram Canvas
          </button>
          <button
            className={`btn sm ${editorMode === "matrix" ? "primary" : "ghost"}`}
            onClick={() => setEditorMode("matrix")}
          >
            <Icons.Grid className="w-4 h-4" /> 🔀 Transition Matrix Grid
          </button>
        </div>

        <div className="flex gap items-center">
          {isLeader && (
            <button className="btn sm outline" onClick={autoArrangeNodes} title="Auto-align diagram grid">
              <Icons.Shuffle className="w-3.5 h-3.5" /> Auto-Arrange Diagram
            </button>
          )}
          {isLeader && (
            <button className="btn sm primary" onClick={() => setShowAddModal(true)}>
              <Icons.Plus className="w-4 h-4" /> Add Status Step
            </button>
          )}
        </div>
      </div>

      {/* Main Body Layout */}
      <div className="workflow-visual-body">
        {/* Left Presets & Palette Sidebar */}
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
                  <small>
                    {preset.nodes.length} statuses • {preset.transitions.length} transitions
                  </small>
                </button>
              ))}
            </div>
          </div>

          <hr className="divider" />

          {/* Quick Batch Tools */}
          <div className="sidebar-section">
            <h4>
              <Icons.Zap className="w-4 h-4 text-amber" /> Quick Batch Wiring
            </h4>
            <p className="sub-text">Generate transition rules in 1 click</p>
            <div className="flex-col gap-sm">
              <button
                className="btn sm outline text-left"
                onClick={handleConnectSequential}
                disabled={!isLeader || nodes.length < 2}
              >
                <Icons.ArrowRight className="w-3.5 h-3.5" /> Chain Sequential Flow
              </button>
              <button
                className="btn sm outline text-left"
                onClick={handleAllowAllToDone}
                disabled={!isLeader || nodes.length < 2}
              >
                <Icons.Check className="w-3.5 h-3.5" /> Connect All to Done Step
              </button>
              <button
                className="btn sm outline danger text-left"
                onClick={() => setTransitions([])}
                disabled={!isLeader || transitions.length === 0}
              >
                <Icons.Trash2 className="w-3.5 h-3.5" /> Clear All Transitions
              </button>
            </div>
          </div>

          <hr className="divider" />

          <div className="sidebar-section">
            <h4>Statuses Summary</h4>
            <div className="palette-statuses">
              {nodes.map((node) => {
                const style = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.todo;
                return (
                  <div
                    key={node.id}
                    className={`palette-item ${selectedNodeId === node.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedNodeId(node.id);
                      setEditingNode(node);
                    }}
                    style={{ borderColor: style.border }}
                  >
                    <span className="status-dot" style={{ backgroundColor: style.border }} />
                    <span className="status-name">{node.name}</span>
                    {node.isInitial && <span className="initial-pill">Start</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* MODE 1: UI STEP BUILDER (No Drag-and-Drop) */}
        {editorMode === "builder" && (
          <div className="workflow-ui-builder-view flex-col gap card">
            {/* Quick Add Transition Bar */}
            {isLeader && (
              <div className="quick-transition-bar flex-wrap gap items-end p-3 border-b">
                <div className="form-group inline">
                  <label className="text-xs font-bold text-muted">From Status</label>
                  <select
                    className="input-select sm"
                    value={quickFrom}
                    onChange={(e) => setQuickFrom(e.target.value)}
                  >
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.category})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group inline">
                  <label className="text-xs font-bold text-muted">To Status</label>
                  <select
                    className="input-select sm"
                    value={quickTo}
                    onChange={(e) => setQuickTo(e.target.value)}
                  >
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name} ({n.category})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group inline flex-grow">
                  <label className="text-xs font-bold text-muted">Action Label (Optional)</label>
                  <input
                    type="text"
                    className="input-text sm"
                    value={quickLabel}
                    onChange={(e) => setQuickLabel(e.target.value)}
                    placeholder="e.g. Approve PR, Pass QA"
                  />
                </div>
                <button className="btn sm primary" onClick={handleAddTransition}>
                  <Icons.Plus className="w-4 h-4" /> Add Allowed Move
                </button>
              </div>
            )}

            {/* Status Steps Pipeline Grid */}
            <div className="builder-pipeline-grid">
              {nodes.map((node, index) => {
                const style = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.todo;
                const outgoingTrans = transitions.filter((t) => t.from === node.id);
                const incomingTrans = transitions.filter((t) => t.to === node.id);

                return (
                  <div
                    key={node.id}
                    className={`step-pipeline-card ${selectedNodeId === node.id ? "selected" : ""}`}
                    style={{ borderColor: style.border }}
                  >
                    <div className="step-card-header flex-between">
                      <span className="category-badge" style={{ backgroundColor: style.bg, color: style.text }}>
                        {node.category.replace("_", " ")}
                      </span>

                      <div className="step-card-controls flex gap-xs">
                        {isLeader && (
                          <button
                            className="icon-btn-xs"
                            onClick={() => moveNodeOrder(index, "prev")}
                            disabled={index === 0}
                            title="Move step earlier"
                          >
                            <Icons.ArrowLeft className="w-3 h-3" />
                          </button>
                        )}
                        {isLeader && (
                          <button
                            className="icon-btn-xs"
                            onClick={() => moveNodeOrder(index, "next")}
                            disabled={index === nodes.length - 1}
                            title="Move step later"
                          >
                            <Icons.ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                        {isLeader && (
                          <button
                            className="icon-btn-xs danger"
                            onClick={() => removeNode(node.id)}
                            title="Delete status step"
                          >
                            <Icons.Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="step-card-body margin-top-xs">
                      <div className="flex-between items-center">
                        <h3 className="step-title">{node.name}</h3>
                        {node.isInitial ? (
                          <span className="initial-pill flex items-center gap-xs">
                            <Icons.PlayCircle className="w-3 h-3" /> Initial
                          </span>
                        ) : (
                          isLeader && (
                            <button
                              className="text-link-xs"
                              onClick={() => setInitialStatus(node.id)}
                              title="Set as starting status"
                            >
                              Make Start
                            </button>
                          )
                        )}
                      </div>

                      <div className="step-transitions-section margin-top-sm">
                        <small className="text-muted font-bold block mb-1">
                          Allowed Transitions ({outgoingTrans.length})
                        </small>
                        <div className="transition-tags-wrap flex-wrap gap-xs">
                          {outgoingTrans.length === 0 ? (
                            <span className="empty-tag">No outgoing transitions</span>
                          ) : (
                            outgoingTrans.map((t) => (
                              <span key={t.id} className="transition-pill-tag">
                                ➔ <b>{t.to}</b>
                                {t.label && <span className="label-sub">({t.label})</span>}
                                {isLeader && (
                                  <button
                                    className="tag-del-btn"
                                    onClick={() => setTransitions((prev) => prev.filter((tr) => tr.id !== t.id))}
                                    title="Remove transition"
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Incoming transitions count */}
                      <div className="incoming-info text-xs text-muted margin-top-xs">
                        Incoming routes: {incomingTrans.length}
                      </div>
                    </div>

                    {isLeader && (
                      <div className="step-card-footer margin-top-sm border-t pt-2 flex-between">
                        <button
                          className="btn text-btn sm"
                          onClick={() => setEditingNode(node)}
                        >
                          <Icons.Edit2 className="w-3 h-3" /> Edit Details
                        </button>

                        <button
                          className="btn text-btn primary sm"
                          onClick={() => {
                            setQuickFrom(node.id);
                            const nextNode = nodes.find((n) => n.id !== node.id && !outgoingTrans.some((t) => t.to === n.id));
                            if (nextNode) setQuickTo(nextNode.id);
                          }}
                        >
                          + Connect To...
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MODE 2: INTERACTIVE DIAGRAM CANVAS */}
        {editorMode === "canvas" && (
          <div
            className={`workflow-canvas ${isPanning ? "panning" : ""}`}
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseDown={startPan}
          >
            {/* Canvas Floating Controls */}
            <div className="canvas-floating-controls">
              <label className="flex items-center gap-xs text-xs text-muted font-bold mr-2">
                <input
                  type="checkbox"
                  checked={enableDragDrop}
                  onChange={(e) => setEnableDragDrop(e.target.checked)}
                />
                Enable Canvas Drag
              </label>
              <button
                className="btn icon-btn shadow"
                title="Zoom In"
                onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
              >
                <Icons.ZoomIn className="w-4 h-4" />
              </button>
              <button
                className="btn icon-btn shadow"
                title="Zoom Out"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
              >
                <Icons.ZoomOut className="w-4 h-4" />
              </button>
              <button
                className="btn icon-btn shadow"
                title="Reset View"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
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
                      <path
                        d={pathData}
                        className="transition-hitbox"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTransitionId(trans.id);
                          setSelectedNodeId(null);
                        }}
                      />
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
                          {isSelected ? (
                            <Icons.Trash2 className="w-3 h-3 text-red" />
                          ) : (
                            <Icons.ArrowRight className="w-3 h-3" />
                          )}
                        </div>
                      </foreignObject>
                    </g>
                  );
                })}
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
                      cursor: enableDragDrop ? "move" : "pointer",
                    }}
                    onMouseDown={(e) => startDragNode(e, node)}
                  >
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

                    <div className="node-body">
                      <b className="status-title">{node.name}</b>
                    </div>

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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* MODE 3: TRANSITION MATRIX GRID */}
        {editorMode === "matrix" && (
          <div className="workflow-matrix-view card flex-col gap p-4 overflow-x-auto">
            <div className="flex-between items-center mb-2">
              <div>
                <h3 className="font-bold text-lg">Transition Permission Matrix</h3>
                <p className="sub-text">Click matrix cells to toggle allowed status-to-status ticket transitions</p>
              </div>

              <div className="flex gap text-xs text-muted">
                <span className="flex items-center gap-xs"><Icons.CheckSquare className="w-3.5 h-3.5 text-emerald" /> Allowed Move</span>
                <span className="flex items-center gap-xs"><Icons.Square className="w-3.5 h-3.5 text-slate" /> Blocked Move</span>
              </div>
            </div>

            <table className="matrix-table border-collapse w-full">
              <thead>
                <tr>
                  <th className="p-3 border text-left bg-slate-900">From \ To</th>
                  {nodes.map((toNode) => (
                    <th key={toNode.id} className="p-3 border text-center font-bold text-xs bg-slate-900">
                      {toNode.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nodes.map((fromNode) => (
                  <tr key={fromNode.id}>
                    <td className="p-3 border font-bold text-sm bg-slate-800">
                      <div className="flex items-center gap-xs">
                        <span
                          className="status-dot"
                          style={{ backgroundColor: (CATEGORY_COLORS[fromNode.category] || CATEGORY_COLORS.todo).border }}
                        />
                        {fromNode.name}
                        {fromNode.isInitial && <span className="initial-pill">Start</span>}
                      </div>
                    </td>

                    {nodes.map((toNode) => {
                      const isSame = fromNode.id === toNode.id;
                      const isAllowed = transitions.some((t) => t.from === fromNode.id && t.to === toNode.id);

                      return (
                        <td
                          key={toNode.id}
                          className={`p-3 border text-center transition-cell ${
                            isSame ? "disabled-cell" : isAllowed ? "allowed-cell" : "blocked-cell"
                          }`}
                          onClick={() => toggleMatrixTransition(fromNode.id, toNode.id)}
                          title={
                            isSame
                              ? "Self transition disabled"
                              : isAllowed
                              ? `Allowed move from ${fromNode.name} to ${toNode.name}. Click to remove.`
                              : `Click to allow move from ${fromNode.name} to ${toNode.name}`
                          }
                        >
                          {isSame ? (
                            <span className="text-muted text-xs">—</span>
                          ) : isAllowed ? (
                            <span className="text-emerald font-bold flex justify-center items-center gap-xs">
                              <Icons.Check className="w-4 h-4" /> Allowed
                            </span>
                          ) : (
                            <span className="text-slate-500 text-xs">Blocked</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add New Status Step Modal */}
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
                Add Status Step
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Details Modal */}
      {editingNode && (
        <div className="modal-backdrop">
          <div className="modal-content card">
            <h3>Edit Status Step: {editingNode.id}</h3>
            <div className="form-group margin-top">
              <label>Status Name</label>
              <input
                type="text"
                className="input-text"
                value={editingNode.name}
                onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
              />
            </div>
            <div className="form-group margin-top">
              <label>Category Type</label>
              <select
                className="input-select"
                value={editingNode.category}
                onChange={(e) => setEditingNode({ ...editingNode, category: e.target.value as any })}
              >
                <option value="backlog">Backlog / Queue</option>
                <option value="todo">To Do / Open</option>
                <option value="in_progress">In Progress / Active</option>
                <option value="review">In Review / Testing</option>
                <option value="done">Done / Completed</option>
                <option value="blocked">Blocked / Cancelled</option>
              </select>
            </div>
            <div className="form-group margin-top flex items-center gap-xs">
              <input
                type="checkbox"
                id="editInitialCheck"
                checked={!!editingNode.isInitial}
                onChange={(e) => setEditingNode({ ...editingNode, isInitial: e.target.checked })}
              />
              <label htmlFor="editInitialCheck" className="cursor-pointer font-bold text-sm">
                Set as Initial Ticket Entry Status
              </label>
            </div>
            <div className="modal-actions flex-end margin-top gap">
              <button className="btn outline" onClick={() => setEditingNode(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={handleUpdateStatus}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
