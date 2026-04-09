type KeyboardCompositionEvent = Pick<KeyboardEvent, "isComposing" | "key"> & {
  keyCode?: number;
};

function resolveHtmlElement(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLElement) {
    return target;
  }

  if (target instanceof Node) {
    return target.parentElement;
  }

  return null;
}

function isEditableElement(element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return true;
  }

  return element.isContentEditable || element.closest("[contenteditable='true']") !== null;
}

export function isKeyboardEventComposing(event: KeyboardCompositionEvent): boolean {
  return event.isComposing || event.key === "Process" || event.key === "Dead" || event.keyCode === 229;
}

export function hasEditableKeyboardTarget(
  event: Pick<KeyboardEvent, "target">,
  doc: Document = document,
): boolean {
  const targetElement = resolveHtmlElement(event.target);
  if (isEditableElement(targetElement)) {
    return true;
  }

  return isEditableElement(resolveHtmlElement(doc.activeElement));
}
