function normalizeNodeType(value) {
  const normalized = String(value || '').toLowerCase();

  if (['concept', 'note', 'example'].includes(normalized)) {
    return normalized;
  }

  // Preserve older question nodes as notes after the question feature removal.
  if (normalized === 'question') {
    return 'note';
  }

  return 'concept';
}

function normalizeNumber(value, fallback = null) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function serializeCanvasNode(node) {
  const nodeID = String(node.nodeID || node.id || '').trim();

  if (!nodeID) {
    return null;
  }

  const data = node.data || {};

  return {
    nodeID,
    nodeType: normalizeNodeType(node.nodeType || data.kind || data.nodeType || node.type),
    title: String(node.title || data.title || '').trim(),
    text: String(node.text || data.text || data.description || '').trim(),
    x: normalizeNumber(node.x ?? node.position?.x, 0),
    y: normalizeNumber(node.y ?? node.position?.y, 0),
    width: normalizeNumber(
      node.width ?? node.data?.width ?? node.style?.width ?? node.measured?.width,
      null,
    ),
    height: normalizeNumber(
      node.height ?? node.data?.height ?? node.style?.height ?? node.measured?.height,
      null,
    ),
  };
}

function serializeCanvasEdge(edge) {
  const edgeID = String(edge.edgeID || edge.id || '').trim();
  const sourceNodeID = String(edge.sourceNodeID || edge.source || '').trim();
  const targetNodeID = String(edge.targetNodeID || edge.target || '').trim();

  if (!edgeID || !sourceNodeID || !targetNodeID) {
    return null;
  }

  return {
    edgeID,
    sourceNodeID,
    targetNodeID,
    label: String(edge.label || edge.data?.label || '').trim(),
    sourceHandle: edge.sourceHandle ? String(edge.sourceHandle) : null,
    targetHandle: edge.targetHandle ? String(edge.targetHandle) : null,
  };
}

function serializeCanvasState(input = {}) {
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const rawEdges = Array.isArray(input.edges) ? input.edges : [];

  const nodes = rawNodes.map(serializeCanvasNode).filter(Boolean);
  const edges = rawEdges.map(serializeCanvasEdge).filter(Boolean);

  return { nodes, edges };
}

function projectCanvasNodeForPrompt(node) {
  return {
    nodeID: node.nodeID,
    nodeType: normalizeNodeType(node.nodeType),
    title: String(node.title || '').trim(),
    text: String(node.text || '').trim(),
  };
}

function projectCanvasEdgeForPrompt(edge) {
  return {
    edgeID: edge.edgeID,
    sourceNodeID: edge.sourceNodeID,
    targetNodeID: edge.targetNodeID,
    label: String(edge.label || '').trim(),
  };
}

function projectCanvasStateForPrompt(input = {}) {
  const serialized = serializeCanvasState(input);

  return {
    revision: normalizeNumber(input.revision, 0) || 0,
    nodes: serialized.nodes.map(projectCanvasNodeForPrompt),
    edges: serialized.edges.map(projectCanvasEdgeForPrompt),
  };
}

function formatCanvasForPrompt(canvasState) {
  if (!canvasState) {
    return 'No canvas is available for this session yet.';
  }

  const nodeLines = (canvasState.nodes || []).map((node) => {
    return `- ${node.nodeID} [${node.nodeType}] ${node.title}: ${node.text}`;
  });

  const edgeLines = (canvasState.edges || []).map((edge) => {
    const labelSuffix = edge.label ? ` (${edge.label})` : '';
    return `- ${edge.sourceNodeID} -> ${edge.targetNodeID}${labelSuffix}`;
  });

  const nodeSection = nodeLines.length > 0 ? nodeLines.join('\n') : '- none';
  const edgeSection = edgeLines.length > 0 ? edgeLines.join('\n') : '- none';

  return `Canvas revision: ${canvasState.revision || 0}\nNodes:\n${nodeSection}\nEdges:\n${edgeSection}`;
}

module.exports = {
  projectCanvasEdgeForPrompt,
  projectCanvasNodeForPrompt,
  projectCanvasStateForPrompt,
  serializeCanvasEdge,
  serializeCanvasNode,
  serializeCanvasState,
  formatCanvasForPrompt,
};
