import { MarkerType, type Edge, type Node } from 'reactflow'
import type { CanvasMode, CanvasState, ChatMessage, StudyNodeKind, StudySession, SystemId } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api'

type ApiParticipant = {
  participantID: string
  systemID: SystemId
}

type ApiSessionSummary = {
  sessionID: string
  participantID: string
  systemID: SystemId
  title: string
  status?: string
}

type ApiCanvasNode = {
  nodeID: string
  nodeType: StudyNodeKind
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
  timestamp?: string
  createdAt?: string
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
}

type HydratedSessionBase = Omit<StudySession, 'followUpQuestions' | 'pendingSuggestions'>

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

function mapApiNodeToReactFlowNode(node: ApiCanvasNode): Node {
  const width = node.width ?? 250
  const height = node.height ?? 166

  return {
    id: node.nodeID,
    type: 'study',
    position: {
      x: node.x ?? 0,
      y: node.y ?? 0,
    },
    width,
    height,
    style: { width, height },
    data: {
      kind: node.nodeType,
      title: node.title,
      text: node.text,
    },
  }
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

export async function fetchCanvas(sessionID: string) {
  const response = await request<CanvasResponse>(`/sessions/${sessionID}/canvas`)
  return response.canvas
}

export async function saveCanvasState(sessionID: string, canvas: CanvasState, actor: 'user' | 'assistant' = 'user') {
  const response = await request<CanvasResponse>(`/sessions/${sessionID}/canvas`, {
    method: 'PUT',
    body: JSON.stringify({
      actor,
      revision: canvas.revision,
      nodes: canvas.nodes,
      edges: canvas.edges,
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

export async function sendChatMessage(sessionID: string, input: string) {
  return request<ChatResponse>(`/sessions/${sessionID}/chat`, {
    method: 'POST',
    body: JSON.stringify({ input }),
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
    systemId: summary.systemID,
    title: summary.title,
    uploadedDocuments: documents.map((document) => document.filename),
    canvas: mapApiCanvasToCanvasState(canvas),
    chatHistory: mapApiInteractionsToChatHistory(interactions),
  }
}
