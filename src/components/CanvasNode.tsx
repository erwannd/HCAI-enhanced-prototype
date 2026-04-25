import { Handle, NodeResizer, Position, type NodeProps } from 'reactflow'
import { useCanvasMode } from '../canvas-mode'
import type { CanvasNodeData } from '../types'

const kindDescriptions = {
  concept: 'Core idea',
  note: 'Learner note',
  example: 'Worked example',
  question: 'Open question',
}

export function CanvasNodeCard({ data, selected }: NodeProps<CanvasNodeData>) {
  const mode = useCanvasMode()

  return (
    <div className={`canvas-node canvas-node--${data.kind} ${selected ? 'is-selected' : ''}`}>
      <NodeResizer
        isVisible={mode === 'edit' && selected}
        minWidth={220}
        minHeight={140}
        lineStyle={{ borderColor: 'rgba(20, 73, 76, 0.45)' }}
        handleStyle={{
          width: 12,
          height: 12,
          borderRadius: 999,
          border: '2px solid rgba(20, 73, 76, 0.6)',
          background: '#f9f5eb',
        }}
      />

      {mode === 'edit' ? (
        <>
          <Handle className="canvas-node__handle" position={Position.Top} type="target" />
          <Handle className="canvas-node__handle" position={Position.Right} type="source" />
          <Handle className="canvas-node__handle" position={Position.Bottom} type="source" />
          <Handle className="canvas-node__handle" position={Position.Left} type="target" />
        </>
      ) : null}

      <div className="canvas-node__label">{kindDescriptions[data.kind]}</div>
      <h4>{data.title}</h4>
      <p>{data.text}</p>
    </div>
  )
}
