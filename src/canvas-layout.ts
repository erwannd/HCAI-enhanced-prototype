import type { XYPosition } from 'reactflow'
import type { StudyCanvasNode, StudyNodeKind } from './types'

const MIN_NODE_WIDTH = 250
const MAX_NODE_WIDTH = 430
const MIN_NODE_HEIGHT = 166
const MAX_NODE_HEIGHT = 420
const NODE_HORIZONTAL_PADDING = 32
const NODE_BASE_HEIGHT = 88
const TITLE_LINE_HEIGHT = 28
const BODY_LINE_HEIGHT = 23
const APPROX_CHARACTER_WIDTH = 7.4

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getWrappedLineCount(text: string, maxCharactersPerLine: number) {
  const segments = text
    .split('\n')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (!segments.length) {
    return 1
  }

  return segments.reduce((total, segment) => {
    return total + Math.max(1, Math.ceil(segment.length / Math.max(1, maxCharactersPerLine)))
  }, 0)
}

export function getAutoNodeDimensions(
  title: string,
  text: string,
  currentDimensions?: { width?: number | null; height?: number | null },
) {
  const contentLines = [title, ...text.split('\n')].map((line) => line.trim()).filter(Boolean)
  const longestLineLength = contentLines.reduce((longest, line) => Math.max(longest, line.length), 0)
  const recommendedWidth = clamp(
    Math.round(MIN_NODE_WIDTH + Math.max(0, longestLineLength - 28) * 3.8),
    MIN_NODE_WIDTH,
    MAX_NODE_WIDTH,
  )

  const currentWidth =
    typeof currentDimensions?.width === 'number' && Number.isFinite(currentDimensions.width)
      ? currentDimensions.width
      : null
  const width = currentWidth ? Math.max(currentWidth, recommendedWidth) : recommendedWidth
  const maxCharactersPerLine = Math.max(
    18,
    Math.floor((width - NODE_HORIZONTAL_PADDING) / APPROX_CHARACTER_WIDTH),
  )

  const titleLineCount = getWrappedLineCount(title, maxCharactersPerLine - 2)
  const textLineCount = getWrappedLineCount(text, maxCharactersPerLine)
  const recommendedHeight = clamp(
    NODE_BASE_HEIGHT + titleLineCount * TITLE_LINE_HEIGHT + textLineCount * BODY_LINE_HEIGHT,
    MIN_NODE_HEIGHT,
    MAX_NODE_HEIGHT,
  )

  const currentHeight =
    typeof currentDimensions?.height === 'number' && Number.isFinite(currentDimensions.height)
      ? currentDimensions.height
      : null
  const height = currentHeight ? Math.max(currentHeight, recommendedHeight) : recommendedHeight

  return { width, height }
}

export function applyAutoNodeSize(node: StudyCanvasNode) {
  const { width, height } = getAutoNodeDimensions(node.data.title, node.data.text, {
    width: node.width ?? Number(node.style?.width ?? NaN),
    height: node.height ?? Number(node.style?.height ?? NaN),
  })

  return {
    ...node,
    width,
    height,
    style: {
      ...node.style,
      width,
      height,
    },
  }
}

export function createAutoSizedNode(input: {
  id: string
  kind: StudyNodeKind
  position: XYPosition
  title: string
  text: string
}) {
  const { width, height } = getAutoNodeDimensions(input.title, input.text)

  return {
    id: input.id,
    type: 'study',
    position: input.position,
    width,
    height,
    style: { width, height },
    data: {
      kind: input.kind,
      title: input.title,
      text: input.text,
    },
  } satisfies StudyCanvasNode
}
