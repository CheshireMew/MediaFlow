export type NavigationDestination =
  | "translator"
  | "editor"
  | "settings"
  | "home";

export const NavigationService = {
  eventName: "mediaflow:navigate",

  navigate: (destination: NavigationDestination, payload?: any) => {
    const event = new CustomEvent(NavigationService.eventName, {
      detail: destination,
      // We could attach payload to detail if we change the contract,
      // but current listeners expect detail to be string.
      // Let's stick to string for now or use a custom event class.
    });
    window.dispatchEvent(event);
  },

  subscribe: (callback: (destination: NavigationDestination) => void) => {
    const handler = (e: CustomEvent) => {
      callback(e.detail as NavigationDestination);
    };
    window.addEventListener(
      NavigationService.eventName,
      handler as EventListener,
    );
    return () =>
      window.removeEventListener(
        NavigationService.eventName,
        handler as EventListener,
      );
  },
};
