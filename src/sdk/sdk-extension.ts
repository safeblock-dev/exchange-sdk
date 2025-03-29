import SafeBlock from "~/sdk/index"
import EventBus from "~/utils/event-bus"

interface DefaultEvents {
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

export type PartialEventBus<T> = EventBus<EventFunctionsToArgs<T> & DefaultEvents, keyof DefaultEvents>

export type ExtractConfigExtensionsType<T extends ((...args: any[]) => SdkExtension[]) | undefined> = T extends
  (...args: any[]) => SdkExtension[] ? ReturnType<T> : never

export type ExtractEvents<T extends ((...args: any[]) => SdkExtension[]) | undefined> =
  EventFunctionsToArgs<FinalEvents<ExtractConfigExtensionsType<T>>> & DefaultEvents

export default abstract class SdkExtension {
  static name = "SdkExtension"

  public readonly name: string

  public abstract events: { [key: string]: (...args: any[]) => void }

  public abstract onInitialize(sdk: SafeBlock): void

  protected constructor() {
    const cls = new.target as typeof SdkExtension
    this.name = cls.name
  }
}
