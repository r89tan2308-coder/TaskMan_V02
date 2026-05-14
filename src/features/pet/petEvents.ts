export type PetEvent =
  | {
      type: 'task-completed';
      taskTitle: string;
      xpDelta: number;
    }
  | {
      type: 'operation-started';
    }
  | {
      type: 'operation-failed';
    }
  | {
      type: 'operation-finished';
    }
  | {
      type: 'route-changed';
    };

const PET_EVENT_NAME = 'taskman:pet-event';
const fallbackTarget = new EventTarget();

const getPetEventTarget = () =>
  typeof window !== 'undefined' ? window : fallbackTarget;

export const emitPetEvent = (event: PetEvent) => {
  getPetEventTarget().dispatchEvent(
    new CustomEvent<PetEvent>(PET_EVENT_NAME, {
      detail: event
    })
  );
};

export const onPetEvent = (listener: (event: PetEvent) => void) => {
  const target = getPetEventTarget();
  const handler = (event: Event) => {
    listener((event as CustomEvent<PetEvent>).detail);
  };
  target.addEventListener(PET_EVENT_NAME, handler);
  return () => {
    target.removeEventListener(PET_EVENT_NAME, handler);
  };
};
