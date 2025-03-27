import SafeBlock from "~/sdk/index"
import { BasicToken } from "~/types"

interface EventCallbacks {
  initialized: (sdk: SafeBlock) => void
  pricesUpdated: (prices: Map<string, Map<string, bigint>>) => void
  tokenAdded: (token: BasicToken) => void
  tokenRemoved: (token: BasicToken) => void
}

export default class EventsManager {
  #eventListeners: Map<keyof EventCallbacks, [Function, boolean][]> = new Map()

  constructor() {}

  public addEventListener<E extends keyof EventCallbacks>(event: E, callback: EventCallbacks[E], once = false) {
    const currentCallbacks = this.#eventListeners.get(event) ?? []
    if (currentCallbacks.some(c => c[0].toString() === callback.toString())) return

    this.#eventListeners.set(event, [
      ...currentCallbacks,
      [callback, once]
    ])
  }

  public addEventListenerOnce<E extends keyof EventCallbacks>(event: E, callback: EventCallbacks[E]) {
    this.addEventListener(event, callback, true)
  }

  public removeEventListener<E extends keyof EventCallbacks>(event: E, callback?: EventCallbacks[E]) {
    if (!callback) this.#eventListeners.delete(event)
    const currentCallbacks = this.#eventListeners.get(event)

    if (!currentCallbacks || currentCallbacks.length === 0) return
    this.#eventListeners.set(event, currentCallbacks.filter(c => c[0].toString() !== callback?.toString()))
  }

  public cleanEventListeners() {
    this.#eventListeners.clear()
  }

  protected emitEvent<E extends keyof EventCallbacks>(event: E, ...args: Parameters<EventCallbacks[E]>) {
    const callbacks = this.#eventListeners.get(event)
    if (!callbacks || callbacks.length === 0) return

    callbacks.forEach(([callback, once]) => {
      callback(...args)

      if (once) this.removeEventListener(event, callback as EventCallbacks[E])
    })
  }
}
