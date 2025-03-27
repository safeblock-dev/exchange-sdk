class EventIdentifier {
  private readonly _identifier: string
  private readonly _once: boolean

  constructor(identifier?: string, once?: boolean) {
    this._identifier = identifier ?? (Math.random() * 1e8).toString(16)
    this._once = once ?? false
  }

  public toString() {
    return this._identifier
  }

  public get identifier() {
    return this._identifier
  }

  public get once() {
    return this._once
  }

  public equal(identifier: EventIdentifier) {
    return this._identifier === identifier.identifier
  }
}

export default class EventBus<EventDescription extends { [key: string]: any[] }, LockedEvents extends string = ""> {
  private _events: Map<keyof EventDescription, [EventIdentifier, (...args: any[]) => void][]> = new Map()

  public addCallback<E extends keyof EventDescription>(event: E, callback: (...args: EventDescription[E]) => void, once = false, identifier?: string) {
    const _identifier = new EventIdentifier(identifier, once)

    this._events.set(event, [[_identifier, callback]])

    return _identifier
  }

  public removeCallback<E extends keyof EventDescription>(event: E, callback?: ((...args: EventDescription[E]) => void) | EventIdentifier): boolean {
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

  public emitEvent<E extends Exclude<keyof EventDescription, LockedEvents>>(event: E, ...args: EventDescription[E]) {
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
