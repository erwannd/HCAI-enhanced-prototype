import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from 'reactflow'
import 'reactflow/dist/style.css'
import './App.css'
import {
  bootstrapParticipant,
  createBackendSession,
  fetchCanvasSuggestions,
  hydrateSession,
  logStudyEvent,
  mapApiSuggestionsToCanvasSuggestions,
  saveCanvasState,
  sendChatMessage,
  updateBackendSessionTitle,
  uploadDocument,
} from './api'
import { CanvasNodeCard } from './components/CanvasNode'
import { MessageContent } from './components/MessageContent'
import { applyAutoNodeSize, createAutoSizedNode } from './canvas-layout'
import { CanvasModeContext } from './canvas-mode'
import type {
  CanvasMode,
  CanvasOperation,
  ChatMessage,
  ExplanationMode,
  RetrievedDocument,
  StudyCanvasEdge,
  StudyCanvasNode,
  StudyNodeKind,
  StudySession,
  SystemId,
} from './types'

const PARTICIPANT_STORAGE_KEY = 'hcai-enhanced-prototype-participant-id'
const SYSTEM_ID_STORAGE_KEY = 'hcai-enhanced-prototype-system-id'
const ACTIVE_SESSION_STORAGE_KEY = 'hcai-enhanced-prototype-active-session-id'
const ASSISTANT_DISPLAY_MODE_STORAGE_KEY = 'hcai-enhanced-prototype-assistant-display-mode'
const ASSISTANT_SIDEBAR_WIDTH_STORAGE_KEY = 'hcai-enhanced-prototype-assistant-sidebar-width'
const EXPLANATION_MODE_STORAGE_KEY = 'hcai-enhanced-prototype-explanation-mode'
const MIN_ASSISTANT_SIDEBAR_WIDTH = 360
const MAX_ASSISTANT_SIDEBAR_WIDTH = 760

type WorkspaceSidebarView = 'sessions' | 'documents'
type AssistantDisplayMode = 'floating' | 'sidebar' | 'fullscreen'
type InspectorModalState = { kind: 'node' | 'edge'; id: string }
type CanvasHoverHint = { x: number; y: number; text: string }

function WorkspaceLogoIcon() {
  return (
    <svg aria-hidden="true" className="rail-button__icon rail-button__icon--logo" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="7.25" />
      <path d="M10 2.75V17.25" />
      <path d="M2.75 10H17.25" />
    </svg>
  )
}

function SessionsIcon() {
  return (
    <svg aria-hidden="true" className="rail-button__icon" viewBox="0 0 20 20">
      <rect x="3" y="3.5" width="14" height="4" rx="2" />
      <rect x="3" y="8.75" width="14" height="3.25" rx="1.625" />
      <rect x="3" y="13.25" width="14" height="3.25" rx="1.625" />
    </svg>
  )
}

function DocumentsIcon() {
  return (
    <svg aria-hidden="true" className="rail-button__icon" viewBox="0 0 20 20">
      <path d="M6.25 2.75H11.75L15.25 6.25V16.25C15.25 16.8023 14.8023 17.25 14.25 17.25H6.25C5.69772 17.25 5.25 16.8023 5.25 16.25V3.75C5.25 3.19772 5.69772 2.75 6.25 2.75Z" />
      <path d="M11.5 2.75V6.5H15.25" />
      <path d="M7.5 9.5H12.75" />
      <path d="M7.5 12H12.75" />
    </svg>
  )
}

function AssistantIcon() {
  return (
    <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 20 20">
      <path d="M4.5 5.25H15.5C16.3284 5.25 17 5.92157 17 6.75V12.25C17 13.0784 16.3284 13.75 15.5 13.75H10L6.25 16V13.75H4.5C3.67157 13.75 3 13.0784 3 12.25V6.75C3 5.92157 3.67157 5.25 4.5 5.25Z" />
      <path d="M6.75 8.75H13.25" />
      <path d="M6.75 10.75H11.5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 20 20">
      <path d="M5 5L15 15" />
      <path d="M15 5L5 15" />
    </svg>
  )
}

function DisplayModeIcon() {
  return (
    <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 20 20">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M9.75 4V16" />
    </svg>
  )
}

function SidebarModeIcon() {
  return (
    <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 20 20">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M8 4V16" />
    </svg>
  )
}

function FloatingModeIcon() {
  return (
    <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 20 20">
      <rect x="4.5" y="5.5" width="11" height="9" rx="1.75" />
      <path d="M6.75 8.25H13.25" />
      <path d="M6.75 10.25H11.25" />
    </svg>
  )
}

function FullscreenModeIcon() {
  return (
    <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 20 20">
      <path d="M7 4H4V7" />
      <path d="M13 4H16V7" />
      <path d="M7 16H4V13" />
      <path d="M13 16H16V13" />
    </svg>
  )
}

const nodeTypes = {
  study: CanvasNodeCard,
}

const kindLabels: Record<StudyNodeKind, string> = {
  concept: 'Concept',
  note: 'Note',
  example: 'Example',
}

const defaultNodeContent: Record<StudyNodeKind, { title: string; text: string }> = {
  concept: {
    title: 'New Concept',
    text: 'Describe the core idea, why it matters, and what it connects to.',
  },
  note: {
    title: 'Study Note',
    text: 'Capture an intuition, analogy, or reminder in your own words.',
  },
  example: {
    title: 'Worked Example',
    text: 'Add a concrete case so the concept is easier to remember later.',
  },
}

function createId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function formatNow() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function createMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: createId('msg'),
    role,
    content,
    createdAt: formatNow(),
    kind: 'default',
  }
}

function formatRelevanceScore(score: number | null | undefined) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return 'n/a'
  }

  return score.toFixed(2)
}

function getOperationTypes(operations: CanvasOperation[]) {
  return Array.from(new Set(operations.map((operation) => operation.type)))
}

function createNode(
  kind: StudyNodeKind,
  x: number,
  y: number,
  title: string,
  text: string,
): StudyCanvasNode {
  return createAutoSizedNode({
    id: createId('node'),
    kind,
    position: { x, y },
    title,
    text,
  })
}

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong while talking to the backend.'
}

function resolveParticipantId() {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('participantID')?.trim() || params.get('participantId')?.trim()

  if (fromQuery) {
    window.localStorage.setItem(PARTICIPANT_STORAGE_KEY, fromQuery)
    return fromQuery
  }

  const fromStorage = window.localStorage.getItem(PARTICIPANT_STORAGE_KEY)?.trim()
  if (fromStorage) {
    return fromStorage
  }

  const prompted = window.prompt('Enter your participant ID')?.trim()
  if (prompted) {
    window.localStorage.setItem(PARTICIPANT_STORAGE_KEY, prompted)
    return prompted
  }

  return null
}

function normalizeSystemId(rawValue: SystemId | string | null | undefined): SystemId | null {
  // Study condition IDs:
  // 1 = baseline system, 2 = enhanced system.
  if (rawValue === 2 || rawValue === '2' || rawValue === 'enhanced') {
    return 2
  }

  if (rawValue === 1 || rawValue === '1' || rawValue === 'baseline') {
    return 1
  }

  return null
}

function resolveSystemId() {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)
  const fromQuery = normalizeSystemId(params.get('systemID')?.trim() || params.get('systemId')?.trim())

  if (fromQuery) {
    window.localStorage.setItem(SYSTEM_ID_STORAGE_KEY, String(fromQuery))
    return fromQuery
  }

  const fromStorage = normalizeSystemId(window.localStorage.getItem(SYSTEM_ID_STORAGE_KEY)?.trim())
  if (fromStorage) {
    return fromStorage
  }

  return null
}

function getStoredActiveSessionId() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)
}

function storeActiveSessionId(sessionId: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId)
}

function clampAssistantSidebarWidth(width: number) {
  return Math.min(MAX_ASSISTANT_SIDEBAR_WIDTH, Math.max(MIN_ASSISTANT_SIDEBAR_WIDTH, width))
}

function getStoredAssistantDisplayMode(): AssistantDisplayMode {
  if (typeof window === 'undefined') {
    return 'floating'
  }

  const rawValue = window.localStorage.getItem(ASSISTANT_DISPLAY_MODE_STORAGE_KEY)
  return rawValue === 'sidebar' || rawValue === 'fullscreen' ? rawValue : 'floating'
}

function storeAssistantDisplayMode(mode: AssistantDisplayMode) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(ASSISTANT_DISPLAY_MODE_STORAGE_KEY, mode)
}

function getStoredAssistantSidebarWidth() {
  if (typeof window === 'undefined') {
    return 440
  }

  const rawValue = Number(window.localStorage.getItem(ASSISTANT_SIDEBAR_WIDTH_STORAGE_KEY))
  return Number.isFinite(rawValue) ? clampAssistantSidebarWidth(rawValue) : 440
}

function storeAssistantSidebarWidth(width: number) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(
    ASSISTANT_SIDEBAR_WIDTH_STORAGE_KEY,
    String(clampAssistantSidebarWidth(width)),
  )
}

function buildFrontendSession(session: Omit<StudySession, 'pendingSuggestions'>): StudySession {
  return {
    ...session,
    pendingSuggestions: [],
  }
}

function normalizeExplanationMode(value: string | null): ExplanationMode {
  return value === 'quick' || value === 'deep_dive' || value === 'example' ? value : 'standard'
}

function getStoredExplanationMode(): ExplanationMode {
  if (typeof window === 'undefined') {
    return 'standard'
  }

  return normalizeExplanationMode(window.localStorage.getItem(EXPLANATION_MODE_STORAGE_KEY))
}

function storeExplanationMode(mode: ExplanationMode) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(EXPLANATION_MODE_STORAGE_KEY, mode)
}

function getExplanationModeLabel(mode: ExplanationMode) {
  switch (mode) {
    case 'quick':
      return 'Quick Answer'
    case 'deep_dive':
      return 'Deep Dive'
    case 'example':
      return 'Show Example'
    default:
      return 'Standard'
  }
}

function getExplanationModeNote(mode: ExplanationMode) {
  switch (mode) {
    case 'quick':
      return 'Short and digestible explanation.'
    case 'deep_dive':
      return 'May include additional background beyond the uploaded materials when helpful.'
    case 'example':
      return 'Uses a concrete example or analogy to explain the concept.'
    default:
      return 'Balanced explanation grounded in the uploaded materials and canvas.'
  }
}

function applyCanvasOperations(
  nodes: StudyCanvasNode[],
  edges: StudyCanvasEdge[],
  operations: CanvasOperation[],
) {
  let nextNodes = nodes
  let nextEdges = edges

  for (const operation of operations) {
    if (operation.type === 'add_node') {
      nextNodes = [...nextNodes, applyAutoNodeSize(operation.node)]
      continue
    }

    if (operation.type === 'delete_node') {
      nextNodes = nextNodes.filter((node) => node.id !== operation.nodeId)
      nextEdges = nextEdges.filter(
        (edge) => edge.source !== operation.nodeId && edge.target !== operation.nodeId,
      )
      continue
    }

    if (operation.type === 'update_node') {
      nextNodes = nextNodes.map((node) =>
        node.id === operation.nodeId
          ? applyAutoNodeSize({
            ...node,
            position: operation.patch.position ?? node.position,
            style: operation.patch.style ? { ...node.style, ...operation.patch.style } : node.style,
            data: {
              ...node.data,
              ...(operation.patch.data ?? {}),
            },
          })
          : node,
      )
      continue
    }

    if (operation.type === 'add_edge') {
      nextEdges = addEdge(operation.edge, nextEdges)
      continue
    }

    nextEdges = nextEdges.filter((edge) => edge.id !== operation.edgeId)
  }

  return { nodes: nextNodes, edges: nextEdges }
}

function App() {
  const [participantId, setParticipantId] = useState('')
  const [systemId, setSystemId] = useState<SystemId | null>(null)
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [sessionDraft, setSessionDraft] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [isWorkspaceSidebarOpen, setIsWorkspaceSidebarOpen] = useState(true)
  const [workspaceSidebarView, setWorkspaceSidebarView] = useState<WorkspaceSidebarView>('sessions')
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [assistantDisplayMode, setAssistantDisplayMode] = useState<AssistantDisplayMode>(() =>
    getStoredAssistantDisplayMode(),
  )
  const [isAssistantDisplayMenuOpen, setIsAssistantDisplayMenuOpen] = useState(false)
  const [assistantSidebarWidth, setAssistantSidebarWidth] = useState(() =>
    getStoredAssistantSidebarWidth(),
  )
  const [isResizingAssistantSidebar, setIsResizingAssistantSidebar] = useState(false)
  const [explanationMode, setExplanationMode] = useState<ExplanationMode>(() =>
    getStoredExplanationMode(),
  )
  const [inspectorModal, setInspectorModal] = useState<InspectorModalState | null>(null)
  const [canvasHoverHint, setCanvasHoverHint] = useState<CanvasHoverHint | null>(null)
  const [canvasModeHint, setCanvasModeHint] = useState<string | null>(null)
  const [isAskAndMapEnabled, setIsAskAndMapEnabled] = useState(false)
  const [isAppLoading, setIsAppLoading] = useState(true)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [isEditingSessionTitle, setIsEditingSessionTitle] = useState(false)
  const [sessionTitleDraft, setSessionTitleDraft] = useState('')
  const [isSavingSessionTitle, setIsSavingSessionTitle] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const hydratedCanvasRevisionsRef = useRef<Record<string, number>>({})
  const canvasSaveTimeoutRef = useRef<number | null>(null)
  const assistantSidebarWidthRef = useRef(assistantSidebarWidth)
  const assistantResizeStartXRef = useRef(0)
  const assistantResizeStartWidthRef = useRef(assistantSidebarWidth)
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const sessionTitleInputRef = useRef<HTMLInputElement | null>(null)
  const canvasHoverHintTimeoutRef = useRef<number | null>(null)
  const canvasModeHintTimeoutRef = useRef<number | null>(null)
  const [, startTransition] = useTransition()

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null
  const selectedNode =
    activeSession?.canvas.nodes.find((node) => node.id === selectedNodeId) ??
    activeSession?.canvas.nodes.find((node) => node.selected) ??
    null
  const selectedEdge =
    activeSession?.canvas.edges.find((edge) => edge.id === selectedEdgeId) ??
    activeSession?.canvas.edges.find((edge) => edge.selected) ??
    null
  const modalNode =
    inspectorModal?.kind === 'node'
      ? activeSession?.canvas.nodes.find((node) => node.id === inspectorModal.id) ?? null
      : null
  const modalEdge =
    inspectorModal?.kind === 'edge'
      ? activeSession?.canvas.edges.find((edge) => edge.id === inspectorModal.id) ?? null
      : null
  const hasSelection = Boolean(selectedNode || selectedEdge)

  useEffect(() => {
    if (!activeSession) {
      setIsEditingSessionTitle(false)
      setSessionTitleDraft('')
      return
    }

    if (!isEditingSessionTitle) {
      setSessionTitleDraft(activeSession.title)
    }
  }, [activeSession, isEditingSessionTitle])

  useEffect(() => {
    if (!isEditingSessionTitle) {
      return
    }

    sessionTitleInputRef.current?.focus()
    sessionTitleInputRef.current?.select()
  }, [isEditingSessionTitle])

  useEffect(() => {
    let isCancelled = false

    async function initializeApp() {
      setIsAppLoading(true)
      setAppError(null)

      try {
        const resolvedParticipantId = resolveParticipantId()

        if (!resolvedParticipantId) {
          throw new Error('A participant ID is required before the enhanced prototype can load.')
        }

        const resolvedSystemId = resolveSystemId()

        if (!isCancelled) {
          setParticipantId(resolvedParticipantId)
          setSystemId(resolvedSystemId)
        }

        const bootstrap = await bootstrapParticipant(resolvedParticipantId, resolvedSystemId)
        const effectiveSystemId = normalizeSystemId(bootstrap.participant.systemID) ?? 1
        const hydratedSessions = await Promise.all(bootstrap.sessions.map(hydrateSession))
        const frontendSessions = hydratedSessions.map(buildFrontendSession)

        frontendSessions.forEach((session) => {
          hydratedCanvasRevisionsRef.current[session.id] = session.canvas.revision
        })

        const storedActiveSessionId = getStoredActiveSessionId()
        const preferredSessionId =
          storedActiveSessionId && frontendSessions.some((session) => session.id === storedActiveSessionId)
            ? storedActiveSessionId
            : frontendSessions[0]?.id ?? ''

        if (!isCancelled) {
          setSessions(frontendSessions)
          setActiveSessionId(preferredSessionId)
          setSystemId(effectiveSystemId)
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(SYSTEM_ID_STORAGE_KEY, String(effectiveSystemId))
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setAppError(normalizeErrorMessage(error))
          setSessions([])
          setActiveSessionId('')
        }
      } finally {
        if (!isCancelled) {
          setIsAppLoading(false)
        }
      }
    }

    void initializeApp()

    return () => {
      isCancelled = true

      if (canvasSaveTimeoutRef.current !== null) {
        window.clearTimeout(canvasSaveTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    assistantSidebarWidthRef.current = assistantSidebarWidth
  }, [assistantSidebarWidth])

  useEffect(() => {
    if (!inspectorModal) {
      return
    }

    if (!activeSession || activeSession.canvas.mode !== 'edit') {
      setInspectorModal(null)
      return
    }

    if (inspectorModal.kind === 'node' && !modalNode) {
      setInspectorModal(null)
      return
    }

    if (inspectorModal.kind === 'edge' && !modalEdge) {
      setInspectorModal(null)
    }
  }, [activeSession, inspectorModal, modalEdge, modalNode])

  useEffect(() => {
    if (!inspectorModal) {
      return
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setInspectorModal(null)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [inspectorModal])

  useEffect(() => {
    return () => {
      if (canvasHoverHintTimeoutRef.current !== null) {
        window.clearTimeout(canvasHoverHintTimeoutRef.current)
      }

      if (canvasModeHintTimeoutRef.current !== null) {
        window.clearTimeout(canvasModeHintTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isResizingAssistantSidebar) {
      return
    }

    function handlePointerMove(event: MouseEvent) {
      const delta = assistantResizeStartXRef.current - event.clientX
      setAssistantSidebarWidth(
        clampAssistantSidebarWidth(assistantResizeStartWidthRef.current + delta),
      )
    }

    function handlePointerUp() {
      setIsResizingAssistantSidebar(false)
      storeAssistantSidebarWidth(assistantSidebarWidthRef.current)

      if (activeSession) {
        queueStudyEvent(activeSession.id, 'assistant_sidebar_resized', 'assistant-sidebar-resizer', {
          width: assistantSidebarWidthRef.current,
        })
      }
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [activeSession, isResizingAssistantSidebar])

  useEffect(() => {
    if (!activeSession || isAppLoading) {
      return
    }

    const hydratedRevision = hydratedCanvasRevisionsRef.current[activeSession.id]
    if (hydratedRevision === activeSession.canvas.revision) {
      return
    }

    const sessionId = activeSession.id
    const revisionToPersist = activeSession.canvas.revision
    const canvasSnapshot = activeSession.canvas

    if (canvasSaveTimeoutRef.current !== null) {
      window.clearTimeout(canvasSaveTimeoutRef.current)
    }

    canvasSaveTimeoutRef.current = window.setTimeout(() => {
      void saveCanvasState(sessionId, canvasSnapshot)
        .then((savedCanvas) => {
          hydratedCanvasRevisionsRef.current[sessionId] = savedCanvas.revision

          if (savedCanvas.revision !== revisionToPersist) {
            setSessions((currentSessions) =>
              currentSessions.map((session) =>
                session.id === sessionId && session.canvas.revision === revisionToPersist
                  ? {
                    ...session,
                    canvas: {
                      ...session.canvas,
                      revision: savedCanvas.revision,
                    },
                  }
                  : session,
              ),
            )
          }
        })
        .catch((error) => {
          setAppError(`Could not save the canvas: ${normalizeErrorMessage(error)}`)
        })
    }, 350)

    return () => {
      if (canvasSaveTimeoutRef.current !== null) {
        window.clearTimeout(canvasSaveTimeoutRef.current)
      }
    }
  }, [activeSession, isAppLoading])

  function updateSession(sessionId: string, updater: (session: StudySession) => StudySession) {
    setSessions((currentSessions) =>
      currentSessions.map((session) => (session.id === sessionId ? updater(session) : session)),
    )
  }

  function updateActiveSession(updater: (session: StudySession) => StudySession) {
    if (!activeSessionId) {
      return
    }

    updateSession(activeSessionId, updater)
  }

  function updateChatMessage(
    sessionId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    updateSession(sessionId, (session) => ({
      ...session,
      chatHistory: session.chatHistory.map((message) =>
        message.id === messageId ? updater(message) : message,
      ),
    }))
  }

  function queueStudyEvent(
    sessionId: string,
    eventType: string,
    elementName: string,
    metadata: Record<string, unknown> = {},
  ) {
    void logStudyEvent(sessionId, {
      eventType,
      elementName,
      metadata,
      timestamp: new Date().toISOString(),
    }).catch(() => undefined)
  }

  function handleToggleRetrievedDocuments(messageId: string) {
    if (!activeSession) {
      return
    }

    const message = activeSession.chatHistory.find((item) => item.id === messageId)
    const isExpanded = !message?.areRetrievedDocumentsExpanded

    updateChatMessage(activeSession.id, messageId, (message) => ({
      ...message,
      areRetrievedDocumentsExpanded: !message.areRetrievedDocumentsExpanded,
    }))

    queueStudyEvent(
      activeSession.id,
      isExpanded ? 'retrieved_documents_expanded' : 'retrieved_documents_collapsed',
      'relevant-documents-toggle',
      {
        messageId,
        retrievedDocumentCount: message?.retrievedDocuments?.length ?? 0,
      },
    )
  }

  async function persistCanvasForSession(
    sessionId: string,
    canvas: StudySession['canvas'],
    actor: 'user' | 'assistant' = 'user',
    operations: CanvasOperation[] = [],
  ) {
    const previousHydratedRevision = hydratedCanvasRevisionsRef.current[sessionId]
    hydratedCanvasRevisionsRef.current[sessionId] = canvas.revision

    try {
      const savedCanvas = await saveCanvasState(sessionId, canvas, actor, operations)
      hydratedCanvasRevisionsRef.current[sessionId] = savedCanvas.revision

      if (savedCanvas.revision !== canvas.revision) {
        setSessions((currentSessions) =>
          currentSessions.map((session) =>
            session.id === sessionId && session.canvas.revision === canvas.revision
              ? {
                ...session,
                canvas: {
                  ...session.canvas,
                  revision: savedCanvas.revision,
                },
              }
              : session,
          ),
        )
      }

      return savedCanvas
    } catch (error) {
      hydratedCanvasRevisionsRef.current[sessionId] = previousHydratedRevision
      throw error
    }
  }

  function handleSwitchSession(sessionId: string) {
    const nextSession = sessions.find((session) => session.id === sessionId)

    startTransition(() => {
      setActiveSessionId(sessionId)
      setIsEditingSessionTitle(false)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      storeActiveSessionId(sessionId)
    })

    if (nextSession && sessionId !== activeSessionId) {
      queueStudyEvent(sessionId, 'session_selected', 'session-list-item', {
        title: nextSession.title,
        previousSessionId: activeSessionId || null,
      })
    }
  }

  async function handleCreateSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!participantId || isCreatingSession) {
      return
    }

    setIsCreatingSession(true)
    setAppError(null)

    try {
      const title = sessionDraft.trim() || `Topic ${sessions.length + 1}`
      const createdSession = await createBackendSession(participantId, title, systemId)
      const hydratedSession = buildFrontendSession(await hydrateSession(createdSession))

      hydratedCanvasRevisionsRef.current[hydratedSession.id] = hydratedSession.canvas.revision

      startTransition(() => {
        setSessions((currentSessions) => [hydratedSession, ...currentSessions])
        setActiveSessionId(hydratedSession.id)
        setSessionDraft('')
        setSelectedNodeId(null)
        setSelectedEdgeId(null)
        setWorkspaceSidebarView('sessions')
        storeActiveSessionId(hydratedSession.id)
      })

      queueStudyEvent(hydratedSession.id, 'session_created', 'session-form', {
        title: hydratedSession.title,
      })
    } catch (error) {
      setAppError(`Could not create the session: ${normalizeErrorMessage(error)}`)
    } finally {
      setIsCreatingSession(false)
    }
  }

  function handleStartEditingSessionTitle() {
    if (!activeSession || isSendingMessage || isSavingSessionTitle) {
      return
    }

    setSessionTitleDraft(activeSession.title)
    setIsEditingSessionTitle(true)
  }

  function handleCancelEditingSessionTitle() {
    setIsEditingSessionTitle(false)
    setSessionTitleDraft(activeSession?.title ?? '')
  }

  async function handleCommitSessionTitle() {
    if (!activeSession || isSavingSessionTitle) {
      return
    }

    const nextTitle = sessionTitleDraft.trim()

    if (!nextTitle) {
      setSessionTitleDraft(activeSession.title)
      setIsEditingSessionTitle(false)
      return
    }

    if (nextTitle === activeSession.title) {
      setIsEditingSessionTitle(false)
      return
    }

    setIsSavingSessionTitle(true)
    setAppError(null)

    try {
      const updatedSession = await updateBackendSessionTitle(activeSession.id, nextTitle)

      updateSession(activeSession.id, (session) => ({
        ...session,
        title: updatedSession.title,
      }))

      queueStudyEvent(activeSession.id, 'session_renamed', 'session-title', {
        previousTitle: activeSession.title,
        nextTitle: updatedSession.title,
      })

      setIsEditingSessionTitle(false)
    } catch (error) {
      setAppError(`Could not rename the session: ${normalizeErrorMessage(error)}`)
      setSessionTitleDraft(activeSession.title)
    } finally {
      setIsSavingSessionTitle(false)
    }
  }

  function handleWorkspaceSidebarAction(nextView: WorkspaceSidebarView) {
    if (nextView === 'documents' && !activeSession) {
      return
    }

    if (isWorkspaceSidebarOpen && workspaceSidebarView === nextView) {
      setIsWorkspaceSidebarOpen(false)
      return
    }

    setWorkspaceSidebarView(nextView)
    setIsWorkspaceSidebarOpen(true)
  }

  function handleToggleWorkspaceSidebar() {
    setIsWorkspaceSidebarOpen((currentValue) => !currentValue)
  }

  function handleToggleAssistant() {
    const nextIsOpen = !isAssistantOpen

    setIsAssistantOpen(nextIsOpen)
    setIsAssistantDisplayMenuOpen(false)

    if (activeSession) {
      queueStudyEvent(
        activeSession.id,
        nextIsOpen ? 'assistant_opened' : 'assistant_closed',
        'assistant-toggle',
      )
    }
  }

  function handleToggleAssistantDisplayMenu() {
    setIsAssistantDisplayMenuOpen((currentValue) => !currentValue)
  }

  function handleChangeAssistantDisplayMode(nextMode: AssistantDisplayMode) {
    setAssistantDisplayMode(nextMode)
    setIsAssistantDisplayMenuOpen(false)
    storeAssistantDisplayMode(nextMode)

    if (activeSession) {
      queueStudyEvent(activeSession.id, 'assistant_display_mode_changed', 'assistant-display-mode', {
        mode: nextMode,
      })
    }
  }

  function handleAssistantSidebarResizeStart(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    assistantResizeStartXRef.current = event.clientX
    assistantResizeStartWidthRef.current = assistantSidebarWidthRef.current
    setIsResizingAssistantSidebar(true)
  }

  function handleToggleAskAndMap() {
    const nextValue = !isAskAndMapEnabled

    setIsAskAndMapEnabled(nextValue)

    if (activeSession) {
      queueStudyEvent(
        activeSession.id,
        nextValue ? 'ask_map_enabled' : 'ask_map_disabled',
        'ask-map-toggle',
      )
    }
  }

  function handleChangeExplanationMode(nextMode: ExplanationMode) {
    setExplanationMode(nextMode)
    storeExplanationMode(nextMode)
  }

  function handleToggleMode(nextMode: CanvasMode) {
    if (!activeSessionId || !activeSession || activeSession.canvas.mode === nextMode) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        mode: nextMode,
      },
    }))

    if (canvasModeHintTimeoutRef.current !== null) {
      window.clearTimeout(canvasModeHintTimeoutRef.current)
    }

    setCanvasModeHint(
      nextMode === 'edit'
        ? 'Edit mode: drag, resize, and connect nodes to build the map.'
        : 'View mode: editing is paused.',
    )

    canvasModeHintTimeoutRef.current = window.setTimeout(() => {
      setCanvasModeHint(null)
      canvasModeHintTimeoutRef.current = null
    }, 1600)
  }

  function handleNodesChange(changes: NodeChange[]) {
    if (!activeSession || activeSession.canvas.mode !== 'edit') {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        nodes: applyNodeChanges(changes, session.canvas.nodes),
      },
    }))
  }

  function handleEdgesChange(changes: EdgeChange[]) {
    if (!activeSession || activeSession.canvas.mode !== 'edit') {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        edges: applyEdgeChanges(changes, session.canvas.edges),
      },
    }))
  }

  function handleSelectionChange({ nodes, edges }: OnSelectionChangeParams) {
    setSelectedNodeId(nodes[0]?.id ?? null)
    setSelectedEdgeId(edges[0]?.id ?? null)
  }

  function openInspectorForSelection() {
    if (!activeSession || activeSession.canvas.mode !== 'edit') {
      return
    }

    if (selectedNode) {
      setInspectorModal({ kind: 'node', id: selectedNode.id })
      return
    }

    if (selectedEdge) {
      setInspectorModal({ kind: 'edge', id: selectedEdge.id })
    }
  }

  function handleNodeDoubleClick(nodeId: string) {
    if (!activeSession || activeSession.canvas.mode !== 'edit') {
      return
    }

    clearCanvasHoverHint()
    setSelectedNodeId(nodeId)
    setSelectedEdgeId(null)
    setInspectorModal({ kind: 'node', id: nodeId })
  }

  function handleEdgeDoubleClick(edgeId: string) {
    if (!activeSession || activeSession.canvas.mode !== 'edit') {
      return
    }

    clearCanvasHoverHint()
    setSelectedEdgeId(edgeId)
    setSelectedNodeId(null)
    setInspectorModal({ kind: 'edge', id: edgeId })
  }

  function scheduleCanvasHoverHintDismissal() {
    if (canvasHoverHintTimeoutRef.current !== null) {
      window.clearTimeout(canvasHoverHintTimeoutRef.current)
    }

    canvasHoverHintTimeoutRef.current = window.setTimeout(() => {
      setCanvasHoverHint(null)
      canvasHoverHintTimeoutRef.current = null
    }, 1100)
  }

  function showCanvasHoverHint(x: number, y: number, text = 'Double-click to edit') {
    if (!activeSession || activeSession.canvas.mode !== 'edit' || inspectorModal) {
      return
    }

    setCanvasHoverHint({ x, y, text })
    scheduleCanvasHoverHintDismissal()
  }

  function updateCanvasHoverHintPosition(x: number, y: number) {
    setCanvasHoverHint((currentHint) =>
      currentHint
        ? {
          ...currentHint,
          x,
          y,
        }
        : currentHint,
    )
  }

  function clearCanvasHoverHint() {
    if (canvasHoverHintTimeoutRef.current !== null) {
      window.clearTimeout(canvasHoverHintTimeoutRef.current)
      canvasHoverHintTimeoutRef.current = null
    }

    setCanvasHoverHint(null)
  }

  function handleConnect(connection: Connection) {
    if (!activeSession || activeSession.canvas.mode !== 'edit' || !connection.source || !connection.target) {
      return
    }

    const edgeId = createId('edge')

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        edges: addEdge(
          {
            ...connection,
            id: edgeId,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
            label: 'relates to',
          },
          session.canvas.edges,
        ),
      },
    }))

    queueStudyEvent(activeSession.id, 'edge_created', 'canvas-edge', {
      edgeId,
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
      sourceHandle: connection.sourceHandle ?? null,
      targetHandle: connection.targetHandle ?? null,
    })
  }

  function handleReconnect(oldEdge: StudyCanvasEdge, connection: Connection) {
    if (!activeSession || activeSession.canvas.mode !== 'edit' || !connection.source || !connection.target) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        edges: reconnectEdge(oldEdge, connection, session.canvas.edges),
      },
    }))
  }

  function handleQuickAdd(kind: StudyNodeKind) {
    if (!activeSession) {
      return
    }

    const nodeCount = activeSession.canvas.nodes.length
    const x = 70 + (nodeCount % 3) * 280
    const y = 70 + Math.floor(nodeCount / 3) * 190
    const seed = defaultNodeContent[kind]
    const nextNode = createNode(kind, x, y, seed.title, seed.text)

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        nodes: [...session.canvas.nodes, nextNode],
      },
    }))

    setSelectedNodeId(nextNode.id)

    queueStudyEvent(activeSession.id, 'node_created', 'quick-add-button', {
      nodeId: nextNode.id,
      nodeKind: kind,
      title: nextNode.data.title,
    })
  }

  function handleDeleteSelection() {
    if (!activeSession || (!selectedNodeId && !selectedEdgeId)) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        nodes: selectedNodeId
          ? session.canvas.nodes.filter((node) => node.id !== selectedNodeId)
          : session.canvas.nodes,
        edges: session.canvas.edges.filter((edge) => {
          if (selectedEdgeId && edge.id === selectedEdgeId) {
            return false
          }

          if (selectedNodeId) {
            return edge.source !== selectedNodeId && edge.target !== selectedNodeId
          }

          return true
        }),
      },
    }))

    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }

  function updateSelectedNodeField(field: 'title' | 'text', value: string) {
    if (!selectedNode) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        nodes: session.canvas.nodes.map((node) =>
          node.id === selectedNode.id
            ? applyAutoNodeSize({
              ...node,
              data: {
                ...node.data,
                [field]: value,
              },
            })
            : node,
        ),
      },
    }))
  }

  function updateSelectedEdgeField(field: 'label' | 'source' | 'target', value: string) {
    if (!selectedEdge) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        edges: session.canvas.edges.map((edge) =>
          edge.id === selectedEdge.id
            ? {
              ...edge,
              [field]: value,
            }
            : edge,
        ),
      },
    }))
  }

  async function handleUploadMaterials(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (!activeSession || !files.length || isUploadingDocuments) {
      return
    }

    setIsUploadingDocuments(true)
    setAppError(null)

    try {
      const uploadedFileNames: string[] = []

      for (const file of files) {
        const response = await uploadDocument(activeSession.id, file)
        uploadedFileNames.push(response.document.filename)

        queueStudyEvent(activeSession.id, 'document_uploaded', 'document-upload', {
          filename: response.document.filename,
          mimeType: file.type || null,
          fileSizeBytes: file.size,
        })
      }

      updateSession(activeSession.id, (session) => ({
        ...session,
        uploadedDocuments: Array.from(new Set([...session.uploadedDocuments, ...uploadedFileNames])),
      }))
    } catch (error) {
      setAppError(`Could not upload the document: ${normalizeErrorMessage(error)}`)
    } finally {
      setIsUploadingDocuments(false)
    }
  }

  async function submitChat(
    question: string,
    withCanvasPlan: boolean,
    source: 'composer' | 'follow_up' = 'composer',
  ) {
    const session = activeSession
    const trimmedQuestion = question.trim()

    if (!session || !trimmedQuestion || isSendingMessage) {
      return
    }

    const userMessage = createMessage('user', trimmedQuestion)
    const answerMessageId = createId('msg')
    const pendingAnswerMessage: ChatMessage = {
      id: answerMessageId,
      role: 'assistant',
      content: `Preparing ${getExplanationModeLabel(explanationMode).toLowerCase()}…`,
      createdAt: formatNow(),
      kind: 'status',
      responseMode: explanationMode,
    }

    updateSession(session.id, (currentSession) => ({
      ...currentSession,
      followUpQuestions: [],
      chatHistory: [...currentSession.chatHistory, userMessage, pendingAnswerMessage],
    }))

    setChatInput('')
    setIsAssistantOpen(true)
    setIsSendingMessage(true)
    setAppError(null)

    queueStudyEvent(session.id, 'chat_submitted', 'chat-composer', {
      messageLength: trimmedQuestion.length,
      usedAskMap: withCanvasPlan,
      source,
      responseMode: explanationMode,
    })

    try {
      if (hydratedCanvasRevisionsRef.current[session.id] !== session.canvas.revision) {
        await persistCanvasForSession(session.id, session.canvas, 'user')
      }

      const response = await sendChatMessage(session.id, trimmedQuestion, explanationMode)
      updateChatMessage(session.id, answerMessageId, (message) => ({
        ...message,
        content: response.botResponse,
        kind: 'default',
        responseMode: response.responseMode ?? explanationMode,
        retrievedDocuments: response.retrievedDocuments ?? [],
        areRetrievedDocumentsExpanded: false,
      }))

      updateSession(session.id, (currentSession) => ({
        ...currentSession,
        followUpQuestions: response.followUpQuestions ?? [],
      }))

      if (withCanvasPlan) {
        const suggestionStatusMessageId = createId('msg')
        const pendingSuggestionMessage: ChatMessage = {
          id: suggestionStatusMessageId,
          role: 'assistant',
          content: 'Preparing canvas suggestion…',
          createdAt: formatNow(),
          kind: 'status',
        }

        updateSession(session.id, (currentSession) => ({
          ...currentSession,
          chatHistory: [...currentSession.chatHistory, pendingSuggestionMessage],
        }))

        try {
          const suggestionResponse = await fetchCanvasSuggestions(
            session.id,
            trimmedQuestion,
            response.botResponse,
          )

          if (import.meta.env.DEV) {
            console.groupCollapsed('[CanvasSuggestions] frontend-response')
            console.log('sessionId', session.id)
            console.log('userInput', trimmedQuestion)
            console.log('assistantResponse', response.botResponse)
            console.log('rawSuggestionResponse', suggestionResponse)
            console.groupEnd()
          }

          updateSession(session.id, (currentSession) => {
            const mappedSuggestions = mapApiSuggestionsToCanvasSuggestions(
              suggestionResponse.suggestions,
              currentSession.canvas,
            )

            if (import.meta.env.DEV) {
              console.groupCollapsed('[CanvasSuggestions] mapped-suggestions')
              console.log('canvasRevision', currentSession.canvas.revision)
              console.log('canvasNodes', currentSession.canvas.nodes)
              console.log('canvasEdges', currentSession.canvas.edges)
              console.log('mappedSuggestions', mappedSuggestions)
              console.groupEnd()
            }

            if (mappedSuggestions.length === 0) {
              return {
                ...currentSession,
                chatHistory: currentSession.chatHistory.map((message) =>
                  message.id === suggestionStatusMessageId
                    ? {
                      ...message,
                      content:
                        'I answered the question, but I do not recommend a canvas update for this turn.',
                      kind: 'default',
                    }
                    : message,
                ),
              }
            }

            const [firstSuggestion, ...remainingSuggestions] = mappedSuggestions
            const firstSuggestionMessage: ChatMessage = {
              id: suggestionStatusMessageId,
              role: 'assistant',
              content: `### ${firstSuggestion.title}

${firstSuggestion.summary}

${firstSuggestion.reason}`,
              createdAt: currentSession.chatHistory.find(
                (message) => message.id === suggestionStatusMessageId,
              )?.createdAt ?? formatNow(),
              kind: 'suggestion',
              suggestionId: firstSuggestion.id,
              suggestionState: 'pending',
            }
            const remainingSuggestionMessages = remainingSuggestions.map((suggestion) => ({
              id: createId('msg'),
              role: 'assistant' as const,
              content: `### ${suggestion.title}

${suggestion.summary}

${suggestion.reason}`,
              createdAt: formatNow(),
              kind: 'suggestion' as const,
              suggestionId: suggestion.id,
              suggestionState: 'pending' as const,
            }))

            return {
              ...currentSession,
              chatHistory: [
                ...currentSession.chatHistory.map((message) =>
                  message.id === suggestionStatusMessageId
                    ? firstSuggestionMessage
                    : message,
                ),
                ...remainingSuggestionMessages,
              ],
              pendingSuggestions: [
                ...mappedSuggestions,
                ...currentSession.pendingSuggestions,
              ],
            }
          })

          suggestionResponse.suggestions.forEach((suggestion) => {
            queueStudyEvent(session.id, 'canvas_suggestion_shown', 'assistant-suggestion', {
              suggestionId: suggestion.id,
              title: suggestion.title,
              operationCount: suggestion.operations.length,
              operationTypes: Array.from(
                new Set(suggestion.operations.map((operation) => operation.type)),
              ),
            })
          })
        } catch (error) {
          updateChatMessage(session.id, suggestionStatusMessageId, (message) => ({
            ...message,
            content: 'I could not prepare a canvas suggestion for this turn.',
            kind: 'default',
          }))
          setAppError(`Could not generate canvas suggestions: ${normalizeErrorMessage(error)}`)
        }
      }
    } catch (error) {
      updateChatMessage(session.id, answerMessageId, (message) => ({
        ...message,
        content: `I could not get a response from the backend right now.\n\n${normalizeErrorMessage(error)}`,
        kind: 'default',
      }))

      setAppError(`Could not send the message: ${normalizeErrorMessage(error)}`)
    } finally {
      setIsSendingMessage(false)
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitChat(chatInput, isAskAndMapEnabled, 'composer')
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitChat(chatInput, isAskAndMapEnabled, 'composer')
    }
  }

  function handleFollowUp(question: string) {
    if (activeSession) {
      queueStudyEvent(activeSession.id, 'followup_prompt_clicked', 'follow-up-chip', {
        question,
      })
    }

    setIsAssistantOpen(true)
    setChatInput(question)

    window.requestAnimationFrame(() => {
      if (!composerTextareaRef.current) {
        return
      }

      composerTextareaRef.current.focus()
      const inputLength = composerTextareaRef.current.value.length
      composerTextareaRef.current.setSelectionRange(inputLength, inputLength)
    })
  }

  function handleAcceptSuggestion(suggestionId: string) {
    if (!activeSession) {
      return
    }

    const suggestion = activeSession.pendingSuggestions.find((item) => item.id === suggestionId)

    if (!suggestion) {
      return
    }

    const applied = applyCanvasOperations(
      activeSession.canvas.nodes,
      activeSession.canvas.edges,
      suggestion.operations,
    )

    const nextCanvas = {
      ...activeSession.canvas,
      revision: activeSession.canvas.revision + 1,
      nodes: applied.nodes,
      edges: applied.edges,
    }

    hydratedCanvasRevisionsRef.current[activeSession.id] = nextCanvas.revision

    updateActiveSession((session) => {
      return {
        ...session,
        canvas: nextCanvas,
        chatHistory: session.chatHistory.map((message) =>
          message.suggestionId === suggestionId
            ? {
              ...message,
              suggestionState: 'accepted',
            }
            : message,
        ),
        pendingSuggestions: session.pendingSuggestions.filter((item) => item.id !== suggestionId),
      }
    })

    void persistCanvasForSession(activeSession.id, nextCanvas, 'assistant', suggestion.operations).catch(
      (error) => {
        setAppError(`Could not persist the accepted AI edit: ${normalizeErrorMessage(error)}`)
      },
    )

    queueStudyEvent(activeSession.id, 'canvas_suggestion_accepted', 'assistant-suggestion', {
      suggestionId,
      operationCount: suggestion.operations.length,
      operationTypes: getOperationTypes(suggestion.operations),
    })

    if (import.meta.env.DEV) {
      console.groupCollapsed('[CanvasSuggestions] accepting-suggestion')
      console.log('sessionId', activeSession.id)
      console.log('suggestionId', suggestionId)
      console.log('suggestion', suggestion)
      console.log('nextCanvas', nextCanvas)
      console.groupEnd()
    }

    const addedNode = suggestion.operations.find((operation) => operation.type === 'add_node')
    setSelectedNodeId(addedNode?.type === 'add_node' ? addedNode.node.id : null)
  }

  function handleDismissSuggestion(suggestionId: string) {
    if (!activeSession) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      chatHistory: session.chatHistory.map((message) =>
        message.suggestionId === suggestionId
          ? {
            ...message,
            suggestionState: 'dismissed',
          }
          : message,
      ),
      pendingSuggestions: session.pendingSuggestions.filter((item) => item.id !== suggestionId),
    }))

    const suggestion = activeSession.pendingSuggestions.find((item) => item.id === suggestionId)

    queueStudyEvent(activeSession.id, 'canvas_suggestion_dismissed', 'assistant-suggestion', {
      suggestionId,
      operationCount: suggestion?.operations.length ?? 0,
      operationTypes: suggestion ? getOperationTypes(suggestion.operations) : [],
    })
  }

  const assistantModeOptions: Array<{
    mode: AssistantDisplayMode
    label: string
    Icon: typeof SidebarModeIcon
  }> = [
      { mode: 'sidebar', label: 'Sidebar', Icon: SidebarModeIcon },
      { mode: 'floating', label: 'Floating', Icon: FloatingModeIcon },
      { mode: 'fullscreen', label: 'Full screen', Icon: FullscreenModeIcon },
    ]

  const assistantPanel = isAssistantOpen && activeSession ? (
    <section
      className={`panel panel--assistant assistant-window assistant-window--${assistantDisplayMode}`}
    >
      <div className="assistant-window__header">
        <div>
          <p className="eyebrow">AI Chat Assistant</p>
          <h3>Explain, then extend the map</h3>
        </div>
        <div className="assistant-window__header-actions">
          <div className="assistant-mode-switch">
            <button
              aria-expanded={isAssistantDisplayMenuOpen ? 'true' : 'false'}
              aria-label="Switch chat mode"
              className="action-button icon-button icon-button--square"
              type="button"
              onClick={handleToggleAssistantDisplayMenu}
            >
              <DisplayModeIcon />
            </button>
            {isAssistantDisplayMenuOpen ? (
              <div className="assistant-mode-switch__menu">
                {assistantModeOptions.map(({ mode, label, Icon }) => (
                  <button
                    className={`assistant-mode-switch__option ${assistantDisplayMode === mode ? 'is-active' : ''
                      }`}
                    key={mode}
                    type="button"
                    onClick={() => handleChangeAssistantDisplayMode(mode)}
                  >
                    <span className="assistant-mode-switch__option-label">
                      <Icon />
                      <span>{label}</span>
                    </span>
                    {assistantDisplayMode === mode ? <span>✓</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            aria-label="Close assistant"
            className="action-button icon-button icon-button--square"
            type="button"
            onClick={handleToggleAssistant}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="assistant-window__body">
        <div className="message-list">
          {activeSession.chatHistory.map((message) => (
            <article
              className={`message message--${message.role} ${message.kind ? `message--${message.kind}` : ''
                } ${message.role === 'assistant' && message.responseMode && message.kind === 'default'
                  ? `message--mode-${message.responseMode}`
                  : ''}`}
              key={message.id}
            >
              <div className="message__meta">
                <strong>
                  {message.kind === 'suggestion'
                    ? 'Canvas suggestion'
                    : message.role === 'assistant'
                      ? 'Assistant'
                      : 'You'}
                </strong>
                <span>{message.createdAt}</span>
              </div>
              {message.role === 'assistant' && message.responseMode && message.kind === 'default' ? (
                <div className="message__mode">
                  <span className="message__mode-badge">{getExplanationModeLabel(message.responseMode)}</span>
                </div>
              ) : null}
              <MessageContent content={message.content} />
              {message.role === 'assistant' && message.retrievedDocuments?.length ? (
                <div className="message__retrieval">
                  <button
                    aria-expanded={message.areRetrievedDocumentsExpanded ? 'true' : 'false'}
                    className="message__retrieval-toggle"
                    type="button"
                    onClick={() => handleToggleRetrievedDocuments(message.id)}
                  >
                    {message.areRetrievedDocumentsExpanded ? 'Hide relevant documents' : 'Relevant documents'} (
                    {message.retrievedDocuments.length})
                  </button>

                  {message.areRetrievedDocumentsExpanded ? (
                    <div className="message__retrieval-list">
                      {message.retrievedDocuments.map((document: RetrievedDocument, index) => (
                        <article
                          className="message__retrieval-card"
                          key={`${message.id}-${document.docName}-${document.chunkIndex ?? index}`}
                        >
                          <div className="message__retrieval-meta">
                            <strong>{document.docName}</strong>
                            <span>Relevance score: {formatRelevanceScore(document.relevanceScore)}</span>
                          </div>
                          <p className="message__retrieval-chunk-label">
                            Chunk {document.chunkIndex ?? index + 1}
                          </p>
                          <p>{document.chunkText}</p>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {message.kind === 'suggestion' ? (
                <div className="message__suggestion-footer">
                  {message.suggestionState === 'pending' ? (
                    <>
                      <button
                        className="action-button action-button--primary"
                        type="button"
                        onClick={() => message.suggestionId && handleAcceptSuggestion(message.suggestionId)}
                      >
                        Accept
                      </button>
                      <button
                        className="action-button"
                        type="button"
                        onClick={() => message.suggestionId && handleDismissSuggestion(message.suggestionId)}
                      >
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <span className="chip chip--muted">
                      {message.suggestionState === 'accepted' ? 'Accepted' : 'Dismissed'}
                    </span>
                  )}
                </div>
              ) : null}
            </article>
          ))}
        </div>

        {activeSession.followUpQuestions.length > 0 ? (
          <section className="chat-section">
            <div className="panel__heading-row">
              <h3>Follow-up prompts</h3>
              <span>{activeSession.followUpQuestions.length}</span>
            </div>
            <div className="chip-list">
              {activeSession.followUpQuestions.map((question) => (
                <button
                  className="chip chip--button"
                  key={question}
                  type="button"
                  onClick={() => handleFollowUp(question)}
                >
                  {question}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <form className="composer" onSubmit={handleSend}>
        <textarea
          className="text-area text-area--composer"
          ref={composerTextareaRef}
          value={chatInput}
          onChange={(event) => setChatInput(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask about the current topic or request a suggested map update."
          rows={4}
        />
        <div className="explanation-mode-picker" role="group" aria-label="Explanation mode">
          {(['quick', 'standard', 'deep_dive', 'example'] as ExplanationMode[]).map((mode) => (
            <button
              key={mode}
              aria-pressed={explanationMode === mode}
              className={`explanation-mode-picker__option ${explanationMode === mode ? 'is-active' : ''}`}
              type="button"
              onClick={() => handleChangeExplanationMode(mode)}
            >
              {getExplanationModeLabel(mode)}
            </button>
          ))}
        </div>
        <p className="composer__mode-note">{getExplanationModeNote(explanationMode)}</p>
        <div className="composer__actions">
          <button
            aria-pressed={isAskAndMapEnabled}
            className={`action-button ${isAskAndMapEnabled ? 'is-active' : ''}`}
            type="button"
            onClick={handleToggleAskAndMap}
          >
            {isAskAndMapEnabled ? 'Ask + Map On' : 'Ask + Map Off'}
          </button>
          <button
            className="action-button action-button--primary"
            disabled={isSendingMessage || !chatInput.trim()}
            type="button"
            onClick={() => void submitChat(chatInput, isAskAndMapEnabled)}
          >
            {isSendingMessage ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </section>
  ) : null

  return (
    <ReactFlowProvider>
      <div className="workspace">
        <div
          className={`workspace__shell ${isAssistantOpen && activeSession && assistantDisplayMode === 'sidebar'
            ? 'workspace__shell--assistant-sidebar'
            : ''
            }`}
        >
          <div className={`workspace__grid ${!isWorkspaceSidebarOpen ? 'workspace__grid--sidebar-closed' : ''}`}>
            <aside className={`workspace-rail ${isWorkspaceSidebarOpen ? 'is-open' : ''}`}>
              <div className="workspace-rail__top">
                <button
                  className="rail-button rail-button--logo"
                  type="button"
                  aria-label={isWorkspaceSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                  data-tooltip={isWorkspaceSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                  onClick={handleToggleWorkspaceSidebar}
                >
                  <WorkspaceLogoIcon />
                  {isWorkspaceSidebarOpen ? <span className="rail-button__label rail-button__label--brand">Workspace</span> : null}
                </button>
              </div>

              <div className="workspace-rail__actions">
                <button
                  aria-label="Show sessions"
                  data-tooltip="Sessions"
                  className={`rail-button rail-button--nav ${isWorkspaceSidebarOpen && workspaceSidebarView === 'sessions' ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => handleWorkspaceSidebarAction('sessions')}
                >
                  <SessionsIcon />
                  {isWorkspaceSidebarOpen ? <span className="rail-button__label">Sessions</span> : null}
                </button>
                <button
                  aria-label="Show uploaded documents"
                  data-tooltip="Documents"
                  className={`rail-button rail-button--nav ${isWorkspaceSidebarOpen && workspaceSidebarView === 'documents' ? 'is-active' : ''}`}
                  type="button"
                  disabled={!activeSession}
                  onClick={() => handleWorkspaceSidebarAction('documents')}
                >
                  <DocumentsIcon />
                  {isWorkspaceSidebarOpen ? <span className="rail-button__label">Documents</span> : null}
                </button>
              </div>

              {isWorkspaceSidebarOpen ? (
                <div className="workspace-rail__content">
                  <div className="workspace-rail__content-header">
                    <p className="eyebrow">
                      {workspaceSidebarView === 'sessions' ? 'Sessions' : 'Uploaded Documents'}
                    </p>
                    <h2>{workspaceSidebarView === 'sessions' ? 'Study topics' : activeSession?.title ?? 'No session selected'}</h2>
                  </div>

                  {appError ? <p className="panel__copy">{appError}</p> : null}

                  {workspaceSidebarView === 'sessions' ? (
                    <>
                      {/* <p className="panel__copy sidebar-drawer__copy">
                        {participantId
                          ? `Participant ${participantId} can switch between topics.`
                          : 'Switch between study topics without taking over the canvas.'}
                      </p> */}

                      <form className="session-form" onSubmit={handleCreateSession}>
                        <input
                          className="text-input"
                          value={sessionDraft}
                          onChange={(event) => setSessionDraft(event.target.value)}
                          placeholder="Create a new session"
                        />
                        <button
                          className="action-button action-button--primary"
                          disabled={isCreatingSession || !participantId}
                          type="submit"
                        >
                          {isCreatingSession ? 'Creating…' : 'New session'}
                        </button>
                      </form>

                      <div className="session-list">
                        {sessions.map((session) => {
                          const isActive = session.id === activeSessionId

                          return (
                            <button
                              key={session.id}
                              className={`session-card ${isActive ? 'is-active' : ''}`}
                              type="button"
                              onClick={() => handleSwitchSession(session.id)}
                            >
                              <div className="session-card__title-row">
                                <strong>{session.title}</strong>
                                <span>System {session.systemId}</span>
                              </div>
                              <p>
                                {session.canvas.nodes.length} nodes, {session.canvas.edges.length} edges
                              </p>
                              <p>
                                {session.chatHistory.length} messages, {session.uploadedDocuments.length} materials
                              </p>
                            </button>
                          )
                        })}

                        {!isAppLoading && !sessions.length ? (
                          <p className="panel__copy">
                            No study sessions exist yet. Create the first one from the form above.
                          </p>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="panel__heading-row">
                        <h3>Materials</h3>
                        <label className="upload-button">
                          {isUploadingDocuments ? 'Uploading…' : 'Upload'}
                          <input type="file" multiple disabled={!activeSession || isUploadingDocuments} onChange={handleUploadMaterials} />
                        </label>
                      </div>

                      <p className="panel__copy sidebar-drawer__copy">
                        Uploaded document appears here.
                      </p>

                      <div className="document-list">
                        {activeSession?.uploadedDocuments.map((documentName) => (
                          <article className="document-card" key={documentName}>
                            <div className="document-card__title">
                              <DocumentsIcon />
                              <strong>{documentName}</strong>
                            </div>
                            <p>Attached to {activeSession.title}</p>
                          </article>
                        ))}

                        {activeSession && !activeSession.uploadedDocuments.length ? (
                          <p className="panel__copy">
                            No uploaded materials yet. Add lecture notes, screenshots, or handouts here.
                          </p>
                        ) : null}

                        {!activeSession ? (
                          <p className="panel__copy">
                            Choose a session first, then upload the documents for that topic here.
                          </p>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </aside>

            <main className="panel panel--canvas">
              {!activeSession ? (
                <>
                  <div className="canvas-header">
                    <div>
                      <p className="eyebrow">Learning Canvas</p>
                      <h2>{isAppLoading ? 'Loading…' : 'Create or choose a session'}</h2>
                    </div>
                  </div>

                  <section className="inspector">
                    <div className="inspector__header">
                      <div>
                        <p className="eyebrow">Workspace Status</p>
                        <h3>{isAppLoading ? 'Connecting to the backend' : 'No active study session'}</h3>
                      </div>
                    </div>
                    <p className="panel__copy">
                      {isAppLoading
                        ? 'Loading participant data, sessions, documents, chat history, and canvas state.'
                        : 'Create a session from the sidebar to start building a concept map and chatting with the assistant.'}
                    </p>
                  </section>
                </>
              ) : (
                <>
                  <div className="canvas-header">
                    <div>
                      <p className="eyebrow">Learning Canvas</p>
                      {isEditingSessionTitle ? (
                        <input
                          ref={sessionTitleInputRef}
                          className="canvas-title-input"
                          value={sessionTitleDraft}
                          onChange={(event) => setSessionTitleDraft(event.target.value)}
                          onBlur={() => void handleCommitSessionTitle()}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void handleCommitSessionTitle()
                            }

                            if (event.key === 'Escape') {
                              event.preventDefault()
                              handleCancelEditingSessionTitle()
                            }
                          }}
                          disabled={isSavingSessionTitle}
                          aria-label="Edit session title"
                        />
                      ) : (
                        <h2
                          className="canvas-title"
                          title="Double-click to rename"
                          onDoubleClick={handleStartEditingSessionTitle}
                        >
                          {activeSession.title}
                        </h2>
                      )}
                    </div>

                    <div className="canvas-header__actions">
                      <div className="mode-toggle">
                        <button
                          className={activeSession.canvas.mode === 'view' ? 'is-active' : ''}
                          type="button"
                          onClick={() => handleToggleMode('view')}
                        >
                          View
                        </button>
                        <button
                          className={activeSession.canvas.mode === 'edit' ? 'is-active' : ''}
                          type="button"
                          onClick={() => handleToggleMode('edit')}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="canvas-toolbar">
                    {(['concept', 'note', 'example'] as StudyNodeKind[]).map((kind) => (
                      <button
                        key={kind}
                        className="action-button"
                        type="button"
                        disabled={activeSession.canvas.mode !== 'edit'}
                        onClick={() => handleQuickAdd(kind)}
                      >
                        Add {kindLabels[kind]}
                      </button>
                    ))}
                    <div className="canvas-toolbar__selection-actions">
                      <button
                        className="action-button"
                        disabled={!hasSelection || activeSession.canvas.mode !== 'edit'}
                        type="button"
                        onClick={openInspectorForSelection}
                      >
                        Edit selection
                      </button>
                      <button
                        className="action-button"
                        disabled={!hasSelection || activeSession.canvas.mode !== 'edit'}
                        type="button"
                        onClick={handleDeleteSelection}
                      >
                        Remove selection
                      </button>
                    </div>
                  </div>

                  <div className="canvas-stage">
                    {canvasModeHint ? <div className="canvas-stage__hint">{canvasModeHint}</div> : null}

                    <CanvasModeContext value={activeSession.canvas.mode}>
                      <ReactFlow
                        fitView
                        proOptions={{ hideAttribution: true }}
                        nodes={activeSession.canvas.nodes}
                        edges={activeSession.canvas.edges}
                        nodeTypes={nodeTypes}
                        connectionMode={ConnectionMode.Loose}
                        onNodesChange={handleNodesChange}
                        onEdgesChange={handleEdgesChange}
                        onConnect={handleConnect}
                        onReconnect={handleReconnect}
                        onSelectionChange={handleSelectionChange}
                        onNodeDoubleClick={(_, node) => handleNodeDoubleClick(node.id)}
                        onEdgeDoubleClick={(_, edge) => handleEdgeDoubleClick(edge.id)}
                        onNodeMouseEnter={(event) =>
                          showCanvasHoverHint(event.clientX, event.clientY)
                        }
                        onNodeMouseMove={(event) =>
                          updateCanvasHoverHintPosition(event.clientX, event.clientY)
                        }
                        onNodeMouseLeave={clearCanvasHoverHint}
                        onEdgeMouseEnter={(event) =>
                          showCanvasHoverHint(event.clientX, event.clientY)
                        }
                        onEdgeMouseMove={(event) =>
                          updateCanvasHoverHintPosition(event.clientX, event.clientY)
                        }
                        onEdgeMouseLeave={clearCanvasHoverHint}
                        nodesDraggable={activeSession.canvas.mode === 'edit' && !inspectorModal}
                        nodesConnectable={activeSession.canvas.mode === 'edit' && !inspectorModal}
                        edgesUpdatable={activeSession.canvas.mode === 'edit' && !inspectorModal}
                        reconnectRadius={24}
                        elementsSelectable={!inspectorModal}
                        panOnDrag={!inspectorModal}
                        zoomOnScroll={!inspectorModal}
                        zoomOnPinch={!inspectorModal}
                        zoomOnDoubleClick={!inspectorModal}
                      >
                        <Background
                          color="rgba(20, 73, 76, 0.12)"
                          gap={22}
                          variant={BackgroundVariant.Dots}
                        />
                        <Controls showInteractive={false} />
                      </ReactFlow>
                    </CanvasModeContext>
                  </div>
                </>
              )}
            </main>
          </div>

          {isAssistantOpen && activeSession && assistantDisplayMode === 'sidebar' ? (
            <aside className="assistant-sidebar" style={{ width: `${assistantSidebarWidth}px` }}>
              <button
                aria-label="Resize assistant sidebar"
                className="assistant-sidebar__resize-handle"
                type="button"
                onMouseDown={handleAssistantSidebarResizeStart}
              />
              {assistantPanel}
            </aside>
          ) : null}
        </div>

        {isAssistantOpen && activeSession && assistantDisplayMode === 'floating' ? (
          <div className="assistant-dock">{assistantPanel}</div>
        ) : null}

        {isAssistantOpen && activeSession && assistantDisplayMode === 'fullscreen' ? (
          <div className="assistant-fullscreen">{assistantPanel}</div>
        ) : null}

        {!isAssistantOpen ? (
          <div className="assistant-dock">
            <button
              aria-label="Show assistant"
              className="action-button assistant-launcher"
              disabled={!activeSession}
              type="button"
              onClick={handleToggleAssistant}
            >
              <AssistantIcon />
              <span>Assistant</span>
              {activeSession?.pendingSuggestions.length ? (
                <span className="assistant-launcher__count">{activeSession.pendingSuggestions.length}</span>
              ) : null}
            </button>
          </div>
        ) : null}
        {canvasHoverHint ? (
          <div
            className="canvas-hover-hint"
            style={{
              left: `${canvasHoverHint.x + 14}px`,
              top: `${canvasHoverHint.y + 16}px`,
            }}
          >
            {canvasHoverHint.text}
          </div>
        ) : null}
        {activeSession && inspectorModal && (modalNode || modalEdge) ? (
          <div className="inspector-modal-backdrop" role="presentation">
            <section
              aria-labelledby="inspector-modal-title"
              aria-modal="true"
              className="inspector-modal"
              role="dialog"
            >
              <div className="inspector-modal__header">
                <div>
                  <p className="eyebrow">Inspector</p>
                  <h3 id="inspector-modal-title">
                    {modalNode
                      ? modalNode.data.title
                      : typeof modalEdge?.label === 'string' && modalEdge.label
                        ? modalEdge.label
                        : 'Selected edge'}
                  </h3>
                </div>
                <div className="inspector-modal__header-actions">
                  {modalNode ? (
                    <span className="chip chip--muted">{kindLabels[modalNode.data.kind]}</span>
                  ) : (
                    <span className="chip chip--muted">Edge</span>
                  )}
                  <button
                    className="action-button icon-button icon-button--square"
                    type="button"
                    onClick={() => setInspectorModal(null)}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>

              {modalNode ? (
                <div className="inspector-modal__form">
                  <label>
                    Title
                    <input
                      autoFocus
                      className="text-input"
                      value={modalNode.data.title}
                      onChange={(event) => updateSelectedNodeField('title', event.target.value)}
                    />
                  </label>
                  <label>
                    Details
                    <textarea
                      className="text-area"
                      rows={6}
                      value={modalNode.data.text}
                      onChange={(event) => updateSelectedNodeField('text', event.target.value)}
                    />
                  </label>
                </div>
              ) : modalEdge ? (
                <div className="inspector-modal__form">
                  <label>
                    Edge Label
                    <input
                      autoFocus
                      className="text-input"
                      value={typeof modalEdge.label === 'string' ? modalEdge.label : ''}
                      onChange={(event) => updateSelectedEdgeField('label', event.target.value)}
                    />
                  </label>
                  <label>
                    From Node
                    <select
                      className="text-input"
                      value={modalEdge.source}
                      onChange={(event) => updateSelectedEdgeField('source', event.target.value)}
                    >
                      {activeSession.canvas.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.data.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    To Node
                    <select
                      className="text-input"
                      value={modalEdge.target}
                      onChange={(event) => updateSelectedEdgeField('target', event.target.value)}
                    >
                      {activeSession.canvas.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.data.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="panel__copy">
                    Drag either endpoint of a selected edge on the canvas to reconnect it to a
                    different side or node.
                  </p>
                </div>
              ) : null}

              <div className="inspector-modal__footer">
                <button className="action-button" type="button" onClick={() => setInspectorModal(null)}>
                  Done
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </ReactFlowProvider>
  )
}

export default App
