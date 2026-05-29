import { useCallback, useState } from 'react';

const DND_MIME = 'application/x-rentspace-block-id';

export function useSortableDnd() {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData(DND_MIME, id);
    e.dataTransfer.effectAllowed = 'move';
    setDragId(id);
  }, []);

  const onDragEnd = useCallback(() => {
    setDragId(null);
    setOverId(null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverId((prev) => (prev === id ? prev : id));
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setOverId(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent, targetId: string, onReorder: (fromId: string, toId: string) => void) => {
      e.preventDefault();
      const fromId = e.dataTransfer.getData(DND_MIME);
      if (fromId && fromId !== targetId) onReorder(fromId, targetId);
      setDragId(null);
      setOverId(null);
    },
    []
  );

  return {
    dragId,
    overId,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
