import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
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
  hydrateSession,
  saveCanvasState,
  sendChatMessage,
  uploadDocument,
} from './api'
import { CanvasNodeCard } from './components/CanvasNode'
import { MessageContent } from './components/MessageContent'
import { CanvasModeContext } from './canvas-mode'
import type {
  CanvasMode,
  CanvasOperation,
  CanvasSuggestion,
  ChatMessage,
  StudyCanvasEdge,
  StudyCanvasNode,
  StudyNodeKind,
  StudySession,
} from './types'

const PARTICIPANT_STORAGE_KEY = 'hcai-enhanced-prototype-participant-id'
const ACTIVE_SESSION_STORAGE_KEY = 'hcai-enhanced-prototype-active-session-id'

type WorkspaceSidebarView = 'sessions' | 'documents'

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

const nodeTypes = {
  study: CanvasNodeCard,
}

const kindLabels: Record<StudyNodeKind, string> = {
  concept: 'Concept',
  note: 'Note',
  example: 'Example',
  question: 'Question',
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
  question: {
    title: 'Open Question',
    text: 'Record a confusion, follow-up, or checkpoint for the assistant.',
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
  }
}

function createNode(
  kind: StudyNodeKind,
  x: number,
  y: number,
  title: string,
  text: string,
): StudyCanvasNode {
  return {
    id: createId('node'),
    type: 'study',
    position: { x, y },
    width: 250,
    height: 166,
    style: { width: 250, height: 166 },
    data: { kind, title, text },
  }
}

function createEdge(
  source: string,
  target: string,
  label: string,
  animated = false,
): StudyCanvasEdge {
  return {
    id: createId('edge'),
    source,
    target,
    label,
    type: 'smoothstep',
    animated,
    markerEnd: { type: MarkerType.ArrowClosed },
  }
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

function getDefaultFollowUpQuestions(title: string, latestQuestion = '') {
  const fingerprint = `${title} ${latestQuestion}`.toLowerCase()

  if (fingerprint.includes('cluster')) {
    return [
      'What is the difference between clustering and classification?',
      'Why do centroids move during k-means?',
      'How should I choose the number of clusters?',
    ]
  }

  if (fingerprint.includes('regress')) {
    return [
      'What does a coefficient mean in linear regression?',
      'Why are residuals useful?',
      'How is regression different from correlation?',
    ]
  }

  return [
    'What is variance in simple terms?',
    'How is PCA different from feature selection?',
    'Can you walk me through a small 2D example?',
  ]
}

function createWelcomeMessage(title: string) {
  const normalized = title.toLowerCase()

  if (normalized.includes('cluster')) {
    return createMessage(
      'assistant',
      `### Clustering workspace

Use this space to compare clustering methods, sketch the update loop, and turn loose ideas into a concept map.

- Ask for explanations in plain language.
- Use **Ask + Map** when you want a reply plus a suggested canvas edit.`,
    )
  }

  if (normalized.includes('regress')) {
    return createMessage(
      'assistant',
      `### Regression workspace

Use the canvas to separate the model ingredients from the evaluation ideas.

$$
\\hat{y} = \\beta_0 + \\beta_1 x_1 + \\dots + \\beta_p x_p
$$`,
    )
  }

  return createMessage(
    'assistant',
    `### Shared learning workspace

This prototype keeps the chat and concept map side by side so a learner can build understanding instead of scrolling through one long answer.

$$
\\text{principal component} = \\arg\\max_{\\|w\\|=1} \\mathrm{Var}(Xw)
$$`,
  )
}

function buildFrontendSession(session: Omit<StudySession, 'followUpQuestions' | 'pendingSuggestions'>): StudySession {
  return {
    ...session,
    chatHistory: session.chatHistory.length > 0 ? session.chatHistory : [createWelcomeMessage(session.title)],
    followUpQuestions: getDefaultFollowUpQuestions(session.title),
    pendingSuggestions: [],
  }
}

function createSuggestionForQuestion(question: string, session: StudySession): CanvasSuggestion {
  const lowerQuestion = question.toLowerCase()
  const baseNode = session.canvas.nodes.find((node) => node.data.kind === 'concept') ?? session.canvas.nodes[0]
  const column = session.canvas.nodes.length % 3
  const row = Math.floor(session.canvas.nodes.length / 3)
  const x = 70 + column * 280
  const y = 70 + row * 200

  if (lowerQuestion.includes('cluster')) {
    const node = createNode(
      'example',
      x,
      y,
      'Cluster Quality',
      'Check whether points inside a cluster stay close while clusters stay distinct.',
    )

    return {
      id: createId('suggestion'),
      title: 'Map cluster quality',
      summary: 'Add a node for evaluating whether a clustering result is actually useful.',
      reason: 'This gives the learner a bridge from algorithm steps to interpretation.',
      operations: [
        { type: 'add_node', node },
        ...(baseNode ? [{ type: 'add_edge' as const, edge: createEdge(baseNode.id, node.id, 'evaluate') }] : []),
      ],
    }
  }

  if (lowerQuestion.includes('regress')) {
    const node = createNode(
      'note',
      x,
      y,
      'Line of Best Fit',
      'A compact intuition: regression finds the line that reduces overall error.',
    )

    return {
      id: createId('suggestion'),
      title: 'Add regression intuition',
      summary: 'Capture a learner-friendly note that connects the formula to the geometric picture.',
      reason: 'Beginners often need a bridge between algebra and intuition.',
      operations: [
        { type: 'add_node', node },
        ...(baseNode ? [{ type: 'add_edge' as const, edge: createEdge(node.id, baseNode.id, 'explains') }] : []),
      ],
    }
  }

  const node = createNode(
    'concept',
    x,
    y,
    'Explained Variance',
    'How much of the original data spread is preserved by a component.',
  )

  return {
    id: createId('suggestion'),
    title: 'Extend the PCA map',
    summary: 'Add explained variance so the map captures how components are evaluated.',
    reason: 'This is a natural next concept after introducing PCA.',
    operations: [
      { type: 'add_node', node },
      ...(baseNode ? [{ type: 'add_edge' as const, edge: createEdge(node.id, baseNode.id, 'measures') }] : []),
    ],
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
      nextNodes = [...nextNodes, operation.node]
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
          ? {
              ...node,
              position: operation.patch.position ?? node.position,
              style: operation.patch.style ? { ...node.style, ...operation.patch.style } : node.style,
              data: {
                ...node.data,
                ...(operation.patch.data ?? {}),
              },
            }
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
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [sessionDraft, setSessionDraft] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [isWorkspaceSidebarOpen, setIsWorkspaceSidebarOpen] = useState(true)
  const [workspaceSidebarView, setWorkspaceSidebarView] = useState<WorkspaceSidebarView>('sessions')
  const [isAssistantOpen, setIsAssistantOpen] = useState(false)
  const [isAppLoading, setIsAppLoading] = useState(true)
  const [isCreatingSession, setIsCreatingSession] = useState(false)
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const [isUploadingDocuments, setIsUploadingDocuments] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const hydratedCanvasRevisionsRef = useRef<Record<string, number>>({})
  const canvasSaveTimeoutRef = useRef<number | null>(null)
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

        if (!isCancelled) {
          setParticipantId(resolvedParticipantId)
        }

        const bootstrap = await bootstrapParticipant(resolvedParticipantId)
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

  function handleSwitchSession(sessionId: string) {
    startTransition(() => {
      setActiveSessionId(sessionId)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      storeActiveSessionId(sessionId)
    })
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
      const createdSession = await createBackendSession(participantId, title)
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
    } catch (error) {
      setAppError(`Could not create the session: ${normalizeErrorMessage(error)}`)
    } finally {
      setIsCreatingSession(false)
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
    setIsAssistantOpen((currentValue) => !currentValue)
  }

  function handleToggleMode(nextMode: CanvasMode) {
    if (!activeSessionId) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        mode: nextMode,
      },
    }))
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

  function handleConnect(connection: Connection) {
    if (!activeSession || activeSession.canvas.mode !== 'edit' || !connection.source || !connection.target) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      canvas: {
        ...session.canvas,
        revision: session.canvas.revision + 1,
        edges: addEdge(
          {
            ...connection,
            id: createId('edge'),
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
            label: 'relates to',
          },
          session.canvas.edges,
        ),
      },
    }))
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
            ? {
                ...node,
                data: {
                  ...node.data,
                  [field]: value,
                },
              }
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

  async function submitChat(question: string, withCanvasPlan: boolean) {
    const session = activeSession
    const trimmedQuestion = question.trim()

    if (!session || !trimmedQuestion || isSendingMessage) {
      return
    }

    const userMessage = createMessage('user', trimmedQuestion)

    updateSession(session.id, (currentSession) => ({
      ...currentSession,
      chatHistory: [...currentSession.chatHistory, userMessage],
    }))

    setChatInput('')
    setIsAssistantOpen(true)
    setIsSendingMessage(true)
    setAppError(null)

    try {
      const response = await sendChatMessage(session.id, trimmedQuestion)
      const assistantMessage = createMessage('assistant', response.botResponse)

      updateSession(session.id, (currentSession) => {
        const suggestion = withCanvasPlan ? createSuggestionForQuestion(trimmedQuestion, currentSession) : undefined

        return {
          ...currentSession,
          chatHistory: [...currentSession.chatHistory, assistantMessage],
          followUpQuestions: getDefaultFollowUpQuestions(currentSession.title, trimmedQuestion),
          pendingSuggestions: suggestion
            ? [suggestion, ...currentSession.pendingSuggestions]
            : currentSession.pendingSuggestions,
        }
      })
    } catch (error) {
      const failureMessage = createMessage(
        'assistant',
        `I could not get a response from the backend right now.\n\n${normalizeErrorMessage(error)}`,
      )

      updateSession(session.id, (currentSession) => ({
        ...currentSession,
        chatHistory: [...currentSession.chatHistory, failureMessage],
      }))

      setAppError(`Could not send the message: ${normalizeErrorMessage(error)}`)
    } finally {
      setIsSendingMessage(false)
    }
  }

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitChat(chatInput, false)
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitChat(chatInput, false)
    }
  }

  function handleAskAndMap() {
    void submitChat(chatInput, true)
  }

  function handleFollowUp(question: string) {
    void submitChat(question, false)
  }

  function handleAcceptSuggestion(suggestionId: string) {
    if (!activeSession) {
      return
    }

    const suggestion = activeSession.pendingSuggestions.find((item) => item.id === suggestionId)

    if (!suggestion) {
      return
    }

    updateActiveSession((session) => {
      const applied = applyCanvasOperations(
        session.canvas.nodes,
        session.canvas.edges,
        suggestion.operations,
      )

      return {
        ...session,
        canvas: {
          ...session.canvas,
          revision: session.canvas.revision + 1,
          nodes: applied.nodes,
          edges: applied.edges,
        },
        pendingSuggestions: session.pendingSuggestions.filter((item) => item.id !== suggestionId),
      }
    })

    const addedNode = suggestion.operations.find((operation) => operation.type === 'add_node')
    setSelectedNodeId(addedNode?.type === 'add_node' ? addedNode.node.id : null)
  }

  function handleDismissSuggestion(suggestionId: string) {
    if (!activeSession) {
      return
    }

    updateActiveSession((session) => ({
      ...session,
      pendingSuggestions: session.pendingSuggestions.filter((item) => item.id !== suggestionId),
    }))
  }

  const conceptCount = activeSession
    ? activeSession.canvas.nodes.filter((node) => node.data.kind === 'concept').length
    : 0

  return (
    <ReactFlowProvider>
      <div className="workspace">
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
                    <p className="panel__copy sidebar-drawer__copy">
                      {participantId
                        ? `Participant ${participantId} can switch between topics without taking over the canvas.`
                        : 'Switch between study topics without taking over the canvas.'}
                    </p>

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
                              <span>{session.systemId}</span>
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
                      Uploaded references stay here so the session list stays compact.
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
                    <h2>{activeSession.title}</h2>
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
                    <button className="action-button" type="button" onClick={handleDeleteSelection}>
                      Remove selection
                    </button>
                  </div>
                </div>

                <div className="canvas-metrics">
                  <div>
                    <span>Revision</span>
                    <strong>{activeSession.canvas.revision}</strong>
                  </div>
                  <div>
                    <span>Concepts</span>
                    <strong>{conceptCount}</strong>
                  </div>
                  <div>
                    <span>Pending AI suggestions</span>
                    <strong>{activeSession.pendingSuggestions.length}</strong>
                  </div>
                </div>

                <div className="canvas-toolbar">
                  {(['concept', 'note', 'example', 'question'] as StudyNodeKind[]).map((kind) => (
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
                </div>

                <div className="canvas-stage">
                  <div className="canvas-stage__hint">
                    {activeSession.canvas.mode === 'edit'
                      ? 'Drag nodes, resize cards, and connect handles to build the map.'
                      : 'View Mode removes editing clutter so the learner can read the concept map.'}
                  </div>

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
                      nodesDraggable={activeSession.canvas.mode === 'edit'}
                      nodesConnectable={activeSession.canvas.mode === 'edit'}
                      edgesUpdatable={activeSession.canvas.mode === 'edit'}
                      reconnectRadius={24}
                      elementsSelectable
                    >
                      <Background
                        color="rgba(20, 73, 76, 0.12)"
                        gap={22}
                        variant={BackgroundVariant.Dots}
                      />
                      <MiniMap
                        pannable
                        zoomable
                        nodeStrokeColor="rgba(20, 73, 76, 0.65)"
                        nodeColor="rgba(245, 241, 230, 0.95)"
                        maskColor="rgba(6, 28, 31, 0.18)"
                      />
                      <Controls showInteractive={false} />
                    </ReactFlow>
                  </CanvasModeContext>
                </div>

                <section className="inspector">
                  <div className="inspector__header">
                    <div>
                      <p className="eyebrow">Inspector</p>
                      <h3>
                        {selectedNode
                          ? selectedNode.data.title
                          : selectedEdge
                            ? typeof selectedEdge.label === 'string' && selectedEdge.label
                              ? selectedEdge.label
                              : 'Selected edge'
                            : 'Select a node or edge'}
                      </h3>
                    </div>
                    {selectedNode ? (
                      <span className="chip chip--muted">{kindLabels[selectedNode.data.kind]}</span>
                    ) : selectedEdge ? (
                      <span className="chip chip--muted">Edge</span>
                    ) : null}
                  </div>

                  {selectedNode ? (
                    <div className="inspector__form">
                      <label>
                        Title
                        <input
                          className="text-input"
                          disabled={activeSession.canvas.mode !== 'edit'}
                          value={selectedNode.data.title}
                          onChange={(event) => updateSelectedNodeField('title', event.target.value)}
                        />
                      </label>
                      <label>
                        Details
                        <textarea
                          className="text-area"
                          disabled={activeSession.canvas.mode !== 'edit'}
                          rows={4}
                          value={selectedNode.data.text}
                          onChange={(event) => updateSelectedNodeField('text', event.target.value)}
                        />
                      </label>
                    </div>
                  ) : selectedEdge ? (
                    <div className="inspector__form">
                      <label>
                        Edge Label
                        <input
                          className="text-input"
                          disabled={activeSession.canvas.mode !== 'edit'}
                          value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
                          onChange={(event) => updateSelectedEdgeField('label', event.target.value)}
                        />
                      </label>
                      <label>
                        From Node
                        <select
                          className="text-input"
                          disabled={activeSession.canvas.mode !== 'edit'}
                          value={selectedEdge.source}
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
                          disabled={activeSession.canvas.mode !== 'edit'}
                          value={selectedEdge.target}
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
                  ) : (
                    <p className="panel__copy">
                      Select a node to edit its content, or select an edge to rename it and change where
                      it connects. In View Mode the inspector stays readable, but fields are locked.
                    </p>
                  )}
                </section>
              </>
            )}
          </main>
        </div>

        <div className="assistant-dock">
          {isAssistantOpen && activeSession ? (
            <section className="panel panel--assistant assistant-window">
              <div className="assistant-window__header">
                <div>
                  <p className="eyebrow">AI Chat Assistant</p>
                  <h3>Explain, then extend the map</h3>
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

              <p className="panel__copy assistant-window__copy">
                The assistant now reads session history and the saved canvas through the backend API,
                then proposes structured canvas edits that you explicitly accept or dismiss.
              </p>

              <div className="assistant-window__body">
                <div className="message-list">
                  {activeSession.chatHistory.map((message) => (
                    <article className={`message message--${message.role}`} key={message.id}>
                      <div className="message__meta">
                        <strong>{message.role === 'assistant' ? 'Assistant' : 'You'}</strong>
                        <span>{message.createdAt}</span>
                      </div>
                      <MessageContent content={message.content} />
                    </article>
                  ))}
                </div>

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

                <section className="chat-section">
                  <div className="panel__heading-row">
                    <h3>AI canvas suggestions</h3>
                    <span>{activeSession.pendingSuggestions.length}</span>
                  </div>

                  <div className="suggestion-list">
                    {activeSession.pendingSuggestions.map((suggestion) => (
                      <article className="suggestion-card" key={suggestion.id}>
                        <div>
                          <h4>{suggestion.title}</h4>
                          <p>{suggestion.summary}</p>
                          <small>{suggestion.reason}</small>
                        </div>
                        <div className="suggestion-card__actions">
                          <button
                            className="action-button action-button--primary"
                            type="button"
                            onClick={() => handleAcceptSuggestion(suggestion.id)}
                          >
                            Accept
                          </button>
                          <button
                            className="action-button"
                            type="button"
                            onClick={() => handleDismissSuggestion(suggestion.id)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </article>
                    ))}

                    {!activeSession.pendingSuggestions.length ? (
                      <p className="panel__copy">
                        Use <strong>Ask + Map</strong> when you want the assistant to reply and prepare a
                        structured canvas change.
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>

              <form className="composer" onSubmit={handleSend}>
                <textarea
                  className="text-area text-area--composer"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Ask about the current topic or request a suggested map update."
                  rows={4}
                />
                <div className="composer__actions">
                  <button
                    className="action-button"
                    disabled={isSendingMessage || !chatInput.trim()}
                    type="button"
                    onClick={handleAskAndMap}
                  >
                    Ask + Map
                  </button>
                  <button
                    className="action-button action-button--primary"
                    disabled={isSendingMessage || !chatInput.trim()}
                    type="submit"
                  >
                    {isSendingMessage ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <button
            aria-label={isAssistantOpen ? 'Hide assistant' : 'Show assistant'}
            className={`action-button assistant-launcher ${isAssistantOpen ? 'is-open' : ''}`}
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
      </div>
    </ReactFlowProvider>
  )
}

export default App
