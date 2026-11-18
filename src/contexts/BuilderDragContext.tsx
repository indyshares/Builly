import React, { createContext, useCallback, useContext, useState } from 'react';
import { DropPosition, LibraryItem } from '../types/builder';
import { RegionKind } from '../services/treeCommandService';

export type DragPayload =
  | {
      kind: 'catalog';
      elementType: string;
      name: string;
    }
  | {
      kind: 'library-item';
      item: LibraryItem;
      mode: 'independent' | 'linked';
    }
  | {
      kind: 'existing';
      nodeIds: string[];
      name: string;
      sourceRegion: RegionKind;
    };

export interface ActiveDropTarget {
  targetNodeId: string;
  position: DropPosition;
  region: RegionKind;
  valid: boolean;
  isNoOp?: boolean;
  reason?: string;
  label: string;
  destinationParentId?: string;
  destinationIndex?: number;
}

interface BuilderDragContextValue {
  activeDrag: DragPayload | null;
  hoverTarget: ActiveDropTarget | null;
  startDrag: (payload: DragPayload) => void;
  setHoverTarget: (target: ActiveDropTarget | null) => void;
  endDrag: () => void;
}

const BuilderDragContext = createContext<BuilderDragContextValue>({
  activeDrag: null,
  hoverTarget: null,
  startDrag: () => {},
  setHoverTarget: () => {},
  endDrag: () => {},
});

export const BuilderDragProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [hoverTarget, setHoverTargetState] = useState<ActiveDropTarget | null>(null);

  const startDrag = useCallback((payload: DragPayload) => {
    setActiveDrag(payload);
    setHoverTargetState(null);
  }, []);

  const setHoverTarget = useCallback((target: ActiveDropTarget | null) => {
    setHoverTargetState((prev) => {
      if (
        prev &&
        target &&
        prev.targetNodeId === target.targetNodeId &&
        prev.position === target.position &&
        prev.valid === target.valid &&
        prev.label === target.label
      ) {
        return prev;
      }
      return target;
    });
  }, []);

  const endDrag = useCallback(() => {
    setActiveDrag(null);
    setHoverTargetState(null);
  }, []);

  return (
    <BuilderDragContext.Provider
      value={{ activeDrag, hoverTarget, startDrag, setHoverTarget, endDrag }}
    >
      {children}
    </BuilderDragContext.Provider>
  );
};

export function useBuilderDrag() {
  return useContext(BuilderDragContext);
}
