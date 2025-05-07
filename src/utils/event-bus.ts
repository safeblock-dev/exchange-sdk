/**
 * Event listener function identifier
 */
export class EventIdentifier {
  private readonly _identifier: string
  private readonly _once: boolean

  /**
   * Event listener function identifier
   *
   * @param {string} identifier string identifier
   * @param {boolean} once listener type
   */
  constructor(identifier?: string, once?: boolean) {
    this._identifier = identifier ?? (Math.random() * 1e8).toFixed(16)
    this._once = once ?? false
  }

  /**
   * Returns the string identifier
   *
   * @alias `identifier`
   *
   * @returns {string} string identifier
   */
  public toString(): string {
    return this._identifier
  }

  /**
   * Returns the string identifier
   *
   * @alias `toString`
   *
   * @returns {string} string identifier
   */
  public get identifier(): string {
    return this._identifier
  }

  /**
   * Returns the listener type
   *
   * @returns {boolean} listener type, `true` — one‑shot
   */
  public get once(): boolean {
    return this._once
  }

  /**
   * Compares two identifiers for equality
   *
   * @param {EventIdentifier} identifier identifier to compare with
   * @returns {boolean} comparison result
   */
  public equal(identifier: EventIdentifier): boolean {
    return this._identifier === identifier.identifier
  }
}

/**
 * Global SDK event bus
 */
export default class EventBus<EventDescription extends { [key: string]: any[] }, LockedEvents extends string = ""> {
  /** List of all registered events */
  private _events: Map<keyof EventDescription, [EventIdentifier, (...args: any[]) => void][]> = new Map()

  /**
   * Add a new event listener
   *
   * @param event event to listen for
   * @param {(...args: EventDescription[*]) => void} callback function to be called when the event fires
   * @param {boolean} once optional listener type
   * @param {string} identifier optional listener identifier
   * @returns {EventIdentifier} pointer to the specific function bound to this event
   */
  public addCallback<E extends keyof EventDescription>(
    event: E,
    callback: (...args: EventDescription[E]) => void,
    once: boolean = false,
    identifier?: string
  ): EventIdentifier {
    const _identifier = new EventIdentifier(identifier, once)

    this._events.set(event, [[_identifier, callback]])

    return _identifier
  }

  /**
   * Remove a specific event listener
   *
   * @param event name of the event for which to remove the listener
   * @param {((...args: EventDescription[*]) => void) | EventIdentifier} callback registered function or its identifier
   * @returns {boolean} result of the removal
   */
  public removeCallback<E extends keyof EventDescription>(
    event: E,
    callback?: ((...args: EventDescription[E]) => void) | EventIdentifier
  ): boolean {
    if (callback) {
      const callbacksList = this._events.get(event)
      if (!callbacksList) return false

      let removed = false
      callbacksList.filter(_callback => {
        if (callback instanceof EventIdentifier && _callback[0].equal(callback)) {
          removed = true
          return false
        } else if (_callback[1].toString() === callback.toString()) {
          removed = true
          return false
        }

        return true
      })

      return removed
    }

    return this._events.delete(event)
  }

  /**
   * Internal method that triggers all listeners for a given event
   *
   * @param {E} event event name
   * @param {any} args arguments passed to the listeners
   * @returns {boolean} execution result
   */
  public emitEvent<E extends Exclude<keyof EventDescription, LockedEvents>>(
    event: E,
    ...args: EventDescription[E]
  ): boolean {
    const callbacks = this._events.get(event)
    if (!callbacks || callbacks.length === 0) return false

    callbacks.forEach(callback => {
      const identifier = callback[0]

      callback[1](...args)

      if (identifier.once) this.removeCallback(event, identifier)
    })

    return true
  }
}