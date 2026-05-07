import { MarkerType, type Edge, type Node } from 'reactflow'
import { applyAutoNodeSize, createAutoSizedNode, getAutoNodeDimensions } from './canvas-layout'
import type {
  CanvasMode,
  CanvasOperation,
  CanvasState,
  CanvasSuggestion,
  ChatMessage,
  ExplanationMode,
  RetrievedDocument,
  StudyNodeKind,
  StudySession,
  SystemId,
} from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api'

type ApiParticipant = {
  participantID: string
  systemID: SystemId | 'baseline' | 'enhanced' | '1' | '2'
}

type ApiSessionSummary = {
  sessionID: string
  participantID: string
  systemID: SystemId | 'baseline' | 'enhanced' | '1' | '2'
  title: string
  followUpQuestions?: string[]
  status?: string
}

type ApiCanvasNode = {
  nodeID: string
  nodeType: string
  title: string
  text: string
  x?: number
  y?: number
  width?: number | null
  height?: number | null
}

type ApiCanvasEdge = {
  edgeID: string
  sourceNodeID: string
  targetNodeID: string
  label?: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

type ApiCanvas = {
  sessionID: string
  revision: number
  nodes: ApiCanvasNode[]
  edges: ApiCanvasEdge[]
}

type ApiInteraction = {
  _id: string
  userInput: string
  botResponse: string
  responseMode?: ExplanationMode | null
  timestamp?: string
  createdAt?: string
  retrievedDocuments?: RetrievedDocument[]
}

type ApiDocument = {
  _id: string
  filename: string
}

type BootstrapResponse = {
  participant: ApiParticipant
  sessions: ApiSessionSummary[]
}

type SessionResponse = {
  session: ApiSessionSummary
}

type CanvasResponse = {
  canvas: ApiCanvas
}

type InteractionsResponse = {
  interactions: ApiInteraction[]
}

type DocumentsResponse = {
  documents: ApiDocument[]
}

type ChatResponse = {
  interaction?: ApiInteraction
  botResponse: string
  responseMode?: ExplanationMode
  followUpQuestions?: string[]
  retrievedDocuments?: RetrievedDocument[]
}

type ApiSuggestionOperation =
  | {
      type: 'add_node'
      node: {
        nodeID: string
        nodeType: string
        title: string
        text: string
      }
    }
  | {
      type: 'update_node'
      nodeID: string
      patch: {
        title?: string
        text?: string
        nodeType?: string
      }
    }
  | {
      type: 'delete_node'
      nodeID: string
    }
  | {
      type: 'add_edge'
      edge: {
        edgeID: string
        sourceNodeID: string
        targetNodeID: string
        label?: string
      }
    }
  | {
      type: 'remove_edge'
      edgeID: string
    }

type ApiSuggestion = {
  id: string
  title: string
  summary: string
  reason: string
  operations: ApiSuggestionOperation[]
}

type SuggestionResponse = {
  suggestions: ApiSuggestion[]
}

type HydratedSessionBase = Omit<StudySession, 'pendingSuggestions'>

type StudyEventPayload = {
  eventType: string
  elementName: string
  metadata?: Record<string, unknown>
  timestamp?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`

    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) {
        errorMessage = payload.error
      }
    } catch {
      // Use the default status-based message if the response body is not JSON.
    }

    throw new Error(errorMessage)
  }

  return (await response.json()) as T
}

function formatMessageTime(timestamp?: string) {
  const date = timestamp ? new Date(timestamp) : new Date()
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function normalizeExplanationMode(value: string | null | undefined): ExplanationMode {
  return value === 'quick' || value === 'deep_dive' || value === 'example' ? value : 'standard'
}

function normalizeSystemId(value: SystemId | 'baseline' | 'enhanced' | '1' | '2' | null | undefined): SystemId {
  // Study condition IDs:
  // 1 = baseline system, 2 = enhanced system.
  if (value === 2 || value === '2' || value === 'enhanced') {
    return 2
  }

  return 1
}

function normalizeStudyNodeKind(value: string): StudyNodeKind {
  if (value === 'concept' || value === 'note' || value === 'example') {
    return value
  }

  // Older sessions may still contain question nodes. Preserve them as notes.
  if (value === 'question') {
    return 'note'
  }

  return 'concept'
}

function mapApiNodeToReactFlowNode(node: ApiCanvasNode): Node {
  return applyAutoNodeSize({
    id: node.nodeID,
    type: 'study',
    position: {
      x: node.x ?? 0,
      y: node.y ?? 0,
    },
    width: node.width ?? undefined,
    height: node.height ?? undefined,
    style:
      node.width || node.height
        ? {
            ...(node.width ? { width: node.width } : {}),
            ...(node.height ? { height: node.height } : {}),
          }
        : undefined,
    data: {
      kind: normalizeStudyNodeKind(node.nodeType),
      title: node.title,
      text: node.text,
    },
  })
}

function mapApiEdgeToReactFlowEdge(edge: ApiCanvasEdge): Edge {
  return {
    id: edge.edgeID,
    source: edge.sourceNodeID,
    target: edge.targetNodeID,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: edge.label ?? '',
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
  }
}

function doNodeBoundsOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
  margin = 28,
) {
  return !(
    left.x + left.width + margin <= right.x ||
    right.x + right.width + margin <= left.x ||
    left.y + left.height + margin <= right.y ||
    right.y + right.height + margin <= left.y
  )
}

function getSuggestedNodePlacement(
  canvas: CanvasState,
  dimensions: { width: number; height: number },
) {
  const occupiedBounds = canvas.nodes.map((node) => ({
    x: node.position.x,
    y: node.position.y,
    width:
      typeof node.width === 'number' && Number.isFinite(node.width)
        ? node.width
        : Number(node.style?.width ?? 250),
    height:
      typeof node.height === 'number' && Number.isFinite(node.height)
        ? node.height
        : Number(node.style?.height ?? 166),
  }))

  const horizontalStep = 320
  const verticalStep = 240
  const maxColumns = 4

  for (let row = 0; row < 24; row += 1) {
    for (let column = 0; column < maxColumns; column += 1) {
      const candidate = {
        x: 70 + column * horizontalStep,
        y: 70 + row * verticalStep,
        width: dimensions.width,
        height: dimensions.height,
      }

      const overlapsExistingNode = occupiedBounds.some((bounds) =>
        doNodeBoundsOverlap(candidate, bounds),
      )

      if (!overlapsExistingNode) {
        return {
          x: candidate.x,
          y: candidate.y,
        }
      }
    }
  }

  const fallbackColumn = canvas.nodes.length % maxColumns
  const fallbackRow = Math.floor(canvas.nodes.length / maxColumns)
  return {
    x: 70 + fallbackColumn * horizontalStep,
    y: 70 + fallbackRow * verticalStep,
  }
}

function mapApiSuggestionOperationToCanvasOperation(
  operation: ApiSuggestionOperation,
  canvas: CanvasState,
): CanvasOperation | null {
  if (operation.type === 'add_node') {
    const dimensions = getAutoNodeDimensions(operation.node.title, operation.node.text)
    const placement = getSuggestedNodePlacement(canvas, dimensions)

    return {
      type: 'add_node',
      node: createAutoSizedNode({
        id: operation.node.nodeID,
        kind: normalizeStudyNodeKind(operation.node.nodeType),
        position: placement,
        title: operation.node.title,
        text: operation.node.text,
      }),
    }
  }

  if (operation.type === 'update_node') {
    return {
      type: 'update_node',
      nodeId: operation.nodeID,
      patch: {
        data: {
          ...(operation.patch.nodeType
            ? { kind: normalizeStudyNodeKind(operation.patch.nodeType) }
            : {}),
          ...(operation.patch.title !== undefined ? { title: operation.patch.title } : {}),
          ...(operation.patch.text !== undefined ? { text: operation.patch.text } : {}),
        },
      },
    }
  }

  if (operation.type === 'delete_node') {
    return {
      type: 'delete_node',
      nodeId: operation.nodeID,
    }
  }

  if (operation.type === 'add_edge') {
    return {
      type: 'add_edge',
      edge: {
        id: operation.edge.edgeID,
        source: operation.edge.sourceNodeID,
        target: operation.edge.targetNodeID,
        label: operation.edge.label ?? '',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
      },
    }
  }

  return {
    type: 'remove_edge',
    edgeId: operation.edgeID,
  }
}

export function mapApiSuggestionToCanvasSuggestion(
  suggestion: ApiSuggestion,
  canvas: CanvasState,
): CanvasSuggestion {
  const workingCanvas: CanvasState = {
    ...canvas,
    nodes: [...canvas.nodes],
    edges: [...canvas.edges],
  }

  return {
    id: suggestion.id,
    title: suggestion.title,
    summary: suggestion.summary,
    reason: suggestion.reason,
    operations: suggestion.operations.reduce<CanvasOperation[]>((mappedOperations, operation) => {
      const mappedOperation = mapApiSuggestionOperationToCanvasOperation(operation, workingCanvas)

      if (!mappedOperation) {
        return mappedOperations
      }

      mappedOperations.push(mappedOperation)

      if (mappedOperation.type === 'add_node') {
        workingCanvas.nodes.push(mappedOperation.node)
      }

      if (mappedOperation.type === 'add_edge') {
        workingCanvas.edges.push(mappedOperation.edge)
      }

      return mappedOperations
    }, []),
  }
}

export function mapApiSuggestionsToCanvasSuggestions(
  suggestions: ApiSuggestion[],
  canvas: CanvasState,
): CanvasSuggestion[] {
  const workingCanvas: CanvasState = {
    ...canvas,
    nodes: [...canvas.nodes],
    edges: [...canvas.edges],
  }

  return suggestions.map((suggestion) => {
    const mappedSuggestion = mapApiSuggestionToCanvasSuggestion(suggestion, workingCanvas)

    mappedSuggestion.operations.forEach((operation) => {
      if (operation.type === 'add_node') {
        workingCanvas.nodes.push(operation.node)
      }

      if (operation.type === 'add_edge') {
        workingCanvas.edges.push(operation.edge)
      }
    })

    return mappedSuggestion
  })
}

export function mapApiCanvasToCanvasState(
  canvas: ApiCanvas,
  mode: CanvasMode = 'edit',
): CanvasState {
  return {
    sessionId: canvas.sessionID,
    revision: canvas.revision,
    mode,
    nodes: canvas.nodes.map(mapApiNodeToReactFlowNode),
    edges: canvas.edges.map(mapApiEdgeToReactFlowEdge),
  }
}

export function mapApiInteractionsToChatHistory(interactions: ApiInteraction[]): ChatMessage[] {
  return interactions.flatMap((interaction) => {
    const timestamp = interaction.timestamp || interaction.createdAt

    return [
      {
        id: `${interaction._id}-user`,
        role: 'user' as const,
        content: interaction.userInput,
        createdAt: formatMessageTime(timestamp),
      },
      {
        id: `${interaction._id}-assistant`,
        role: 'assistant' as const,
        content: interaction.botResponse,
        createdAt: formatMessageTime(timestamp),
        responseMode: normalizeExplanationMode(interaction.responseMode),
        retrievedDocuments: interaction.retrievedDocuments ?? [],
        areRetrievedDocumentsExpanded: false,
      },
    ]
  })
}

export async function bootstrapParticipant(participantID: string) {
  return request<BootstrapResponse>('/participants/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ participantID }),
  })
}

export async function createBackendSession(participantID: string, title: string) {
  const response = await request<SessionResponse>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ participantID, title }),
  })

  return response.session
}

export async function updateBackendSessionTitle(sessionID: string, title: string) {
  const response = await request<SessionResponse>(`/sessions/${sessionID}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })

  return response.session
}

export async function fetchCanvas(sessionID: string) {
  const response = await request<CanvasResponse>(`/sessions/${sessionID}/canvas`)
  return response.canvas
}

export async function saveCanvasState(
  sessionID: string,
  canvas: CanvasState,
  actor: 'user' | 'assistant' = 'user',
  operations: CanvasOperation[] = [],
) {
  const response = await request<CanvasResponse>(`/sessions/${sessionID}/canvas`, {
    method: 'PUT',
    body: JSON.stringify({
      actor,
      revision: canvas.revision,
      nodes: canvas.nodes,
      edges: canvas.edges,
      operations,
    }),
  })

  return response.canvas
}

export async function fetchInteractions(sessionID: string) {
  const response = await request<InteractionsResponse>(`/sessions/${sessionID}/interactions`)
  return response.interactions
}

export async function fetchDocuments(sessionID: string) {
  const response = await request<DocumentsResponse>(`/sessions/${sessionID}/documents`)
  return response.documents
}

export async function uploadDocument(sessionID: string, file: File) {
  const formData = new FormData()
  formData.append('document', file)

  const response = await fetch(`${API_BASE_URL}/sessions/${sessionID}/documents`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    let errorMessage = `Upload failed with status ${response.status}`

    try {
      const payload = (await response.json()) as { error?: string }
      if (payload.error) {
        errorMessage = payload.error
      }
    } catch {
      // Keep the default upload error if parsing fails.
    }

    throw new Error(errorMessage)
  }

  return (await response.json()) as { document: ApiDocument }
}

export async function sendChatMessage(
  sessionID: string,
  input: string,
  responseMode: ExplanationMode,
) {
  return request<ChatResponse>(`/sessions/${sessionID}/chat`, {
    method: 'POST',
    body: JSON.stringify({ input, responseMode }),
  })
}

export async function fetchCanvasSuggestions(
  sessionID: string,
  userInput: string,
  assistantResponse: string,
) {
  return request<SuggestionResponse>(`/sessions/${sessionID}/canvas-suggestions`, {
    method: 'POST',
    body: JSON.stringify({
      userInput,
      assistantResponse,
    }),
  })
}

export async function logStudyEvent(sessionID: string, payload: StudyEventPayload) {
  return request<{ event: unknown }>(`/sessions/${sessionID}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function hydrateSession(summary: ApiSessionSummary): Promise<HydratedSessionBase> {
  const [canvas, interactions, documents] = await Promise.all([
    fetchCanvas(summary.sessionID),
    fetchInteractions(summary.sessionID),
    fetchDocuments(summary.sessionID),
  ])

  return {
    id: summary.sessionID,
    participantId: summary.participantID,
    systemId: normalizeSystemId(summary.systemID),
    title: summary.title,
    uploadedDocuments: documents.map((document) => document.filename),
    canvas: mapApiCanvasToCanvasState(canvas),
    chatHistory: mapApiInteractionsToChatHistory(interactions),
    followUpQuestions: summary.followUpQuestions ?? [],
  }
}
