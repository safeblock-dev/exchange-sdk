import SafeBlock from "~/sdk/index"
import EventBus from "~/utils/event-bus"

/** Standard events implemented by the SDK core */
interface DefaultEvents {
  /** Fired after all extensions have finished initializing */
  onExtensionsInitializationFinished: [extensionNames: string[]]
}

type ValidEventCarrier<T> = T extends { events: infer E } ? E : never

type ExtensionsEvents<T> = T extends readonly any[]
  ? {
    [K in keyof T]: ValidEventCarrier<T[K]> extends never ? never : ValidEventCarrier<T[K]>
  }[number]
  : never

type UnionToIntersection<U> =
  (U extends any ? (x: U) => void : never) extends (x: infer I) => void ? I : never

export type FinalEvents<T> =
  T extends undefined | never ? {} : UnionToIntersection<ExtensionsEvents<T>>

type EventFunctionsToArgs<T extends Record<string, (...args: any[]) => any> | unknown> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? Parameters<T[K]> : never
}

/** Type describing a partially‑typed event bus used inside extensions */
export type PartialEventBus<T> = EventBus<EventFunctionsToArgs<T> & DefaultEvents, keyof DefaultEvents>

export type ExtractConfigExtensionsType<T extends ((...args: any[]) => SdkExtension[]) | undefined> = T extends
  (...args: any[]) => SdkExtension[] ? ReturnType<T> : never

/** Helper type that extracts extension events as an object */
export type ExtractEvents<T extends ((...args: any[]) => SdkExtension[]) | undefined> =
  EventFunctionsToArgs<FinalEvents<ExtractConfigExtensionsType<T>>> & DefaultEvents

/**
 * Base class for an SDK extension.
 *
 * All SDK extensions must inherit from this class.
 */
export default abstract class SdkExtension {
  /** Unique extension name */
  static name = "SdkExtension"

  /**
   * Unique extension name within the instance.
   *
   * Automatically set from the static `name` field.
   */
  public readonly name: string

  /** Events implemented by the extension */
  public abstract events: { [key: string]: (...args: any[]) => void }

  /**
   * Called right after all extensions have finished initializing.
   *
   * Unlike the constructor, this method has access to every other extension,
   * even those located later in the list.
   */
  public abstract onInitialize(sdk: SafeBlock): void

  protected constructor() {
    const cls = new.target as typeof SdkExtension
    this.name = cls.name
  }
}
