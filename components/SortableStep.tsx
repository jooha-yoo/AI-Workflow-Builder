"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function SortableStep({
  id,
  index,
  value,
  onChange,
  onRemove,
}: {
  id: string;
  index: number;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 bg-white">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 px-1 touch-none"
        aria-label="Drag to reorder step"
      >
        ⠿
      </button>
      <span className="text-sm text-neutral-400 w-5 text-right">{index + 1}.</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
        placeholder={`Step ${index + 1}`}
      />
      <button
        type="button"
        onClick={onRemove}
        className="text-neutral-400 hover:text-red-600 text-sm px-1"
        aria-label="Remove step"
      >
        ✕
      </button>
    </div>
  );
}
