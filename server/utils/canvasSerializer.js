function normalizeNodeType(value) {
  const normalized = String(value || '').toLowerCase();

  if (['concept', 'note', 'example', 'question'].includes(normalized)) {
    return normalized;
  }

  return 'concept';
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
  };
}

function serializeCanvasState(input = {}) {
  const rawNodes = Array.isArray(input.nodes) ? input.nodes : [];
  const rawEdges = Array.isArray(input.edges) ? input.edges : [];

  const nodes = rawNodes.map(serializeCanvasNode).filter(Boolean);
  const edges = rawEdges.map(serializeCanvasEdge).filter(Boolean);

  return { nodes, edges };
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
  serializeCanvasEdge,
  serializeCanvasNode,
  serializeCanvasState,
  formatCanvasForPrompt,
};
