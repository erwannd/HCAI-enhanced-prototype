import type { CSSProperties } from 'react'
import type { Edge, Node, XYPosition } from 'reactflow'

export type StudyNodeKind = 'concept' | 'note' | 'example'
export type CanvasMode = 'view' | 'edit'
// Study condition IDs:
// 1 = baseline system, 2 = enhanced system.
export type SystemId = 1 | 2
export type ExplanationMode = 'quick' | 'standard' | 'deep_dive' | 'example'

export type CanvasNodeData = {
  kind: StudyNodeKind
  title: string
  text: string
}

export type StudyCanvasNode = Node<CanvasNodeData>
export type StudyCanvasEdge = Edge

export type CanvasState = {
  sessionId: string
  revision: number
  mode: CanvasMode
  nodes: StudyCanvasNode[]
  edges: StudyCanvasEdge[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  kind?: 'default' | 'status' | 'suggestion'
  responseMode?: ExplanationMode
  suggestionId?: string
  suggestionState?: 'pending' | 'accepted' | 'dismissed'
  retrievedDocuments?: RetrievedDocument[]
  areRetrievedDocumentsExpanded?: boolean
}

export type RetrievedDocument = {
  docName: string
  chunkIndex: number | null
  chunkText: string
  relevanceScore: number | null
}

export type CanvasOperation =
  | { type: 'add_node'; node: StudyCanvasNode }
  | { type: 'delete_node'; nodeId: string }
  | {
      type: 'update_node'
      nodeId: string
      patch: {
        position?: XYPosition
        style?: CSSProperties
        data?: Partial<CanvasNodeData>
      }
    }
  | { type: 'add_edge'; edge: StudyCanvasEdge }
  | { type: 'remove_edge'; edgeId: string }

export type CanvasSuggestion = {
  id: string
  title: string
  summary: string
  reason: string
  operations: CanvasOperation[]
}

export type StudySession = {
  id: string
  participantId: string
  systemId: SystemId
  title: string
  uploadedDocuments: string[]
  canvas: CanvasState
  chatHistory: ChatMessage[]
  followUpQuestions: string[]
  pendingSuggestions: CanvasSuggestion[]
}
