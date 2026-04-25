import { Handle, NodeResizer, Position, type NodeProps } from 'reactflow'
import { useCanvasMode } from '../canvas-mode'
import type { CanvasNodeData } from '../types'

const kindDescriptions = {
  concept: 'Core idea',
  note: 'Learner note',
  example: 'Worked example',
  question: 'Open question',
}

const handlePositions = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
]

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
          {handlePositions.map((handle) => (
            <Handle
              key={handle.id}
              className="canvas-node__handle"
              id={handle.id}
              isConnectableEnd
              isConnectableStart
              position={handle.position}
              type="source"
            />
          ))}
        </>
      ) : null}

      <div className="canvas-node__label">{kindDescriptions[data.kind]}</div>
      <h4>{data.title}</h4>
      <p>{data.text}</p>
    </div>
  )
}
