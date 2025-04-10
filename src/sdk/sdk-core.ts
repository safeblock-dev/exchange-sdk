import { Address } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import EvmConverter from "~/sdk/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import SafeBlock from "~/sdk/index"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import SdkExtension, { ExtractConfigExtensionsType, ExtractEvents } from "~/sdk/sdk-extension"
import { InternalMixinList, SdkMixins } from "~/sdk/sdk-mixins"
import StateManager from "~/sdk/state-manager"
import { ExchangeRequest, SimulatedRoute } from "~/types"
import EventBus, { EventIdentifier } from "~/utils/event-bus"

type TAddressesList = { [p: string]: string } & { default: string }

type InstanceTypeOf<T extends new (...args: any) => any> = T extends new (...args: any) => infer R ? R : never

export interface ExtensionInitializeEnvironment<T extends EventBus<any>> {
  sdk: SafeBlock
  config: SdkConfig
  eventBus: T
  mixins: SdkMixins
}

export type SdkConfig = Partial<{
  routePriceDifferenceLimit: number

  debugLogListener: (...message: any[]) => void

  routesCountLimit: number
  routesCountHardLimit: number

  customNetworkMappings: Record<string, Network>

  extensions: <T extends EventBus<any>> (environment: ExtensionInitializeEnvironment<T>) => SdkExtension[]

  contractAddresses: Partial<{
    entryPoint: TAddressesList
    quoter: TAddressesList
  }>

  backend: {
    url: string
    headers?: Record<string, string>
  }
}>

export default class SdkCore<Configuration extends SdkConfig = SdkConfig> extends StateManager {
  protected readonly eventBus = new EventBus<ExtractEvents<Configuration["extensions"]>>()
  protected readonly sdkConfig: SdkConfig
  protected _extensions: ExtractConfigExtensionsType<Configuration["extensions"]> = [] as any

  protected readonly mixins = new SdkMixins()

  constructor(sdkConfig?: Configuration) {
    super()

    this.sdkConfig = sdkConfig ?? {}
  }

  // Mixins
  public addMixin<
    Location extends keyof InternalMixinList,
    Namespace extends keyof InternalMixinList[Location],
    Breakpoint extends keyof InternalMixinList[Location][Namespace],
    Value extends InternalMixinList[Location][Namespace][Breakpoint]
  >(location: Location, namespace: Namespace, breakpoint: Breakpoint, callback: (value: Value) => Value) {
    this.mixins.addMixin(location, namespace, breakpoint, callback)
  }

  public removeMixin(identifier: string) {
    this.mixins.removeMixin(identifier)
  }


  // Event listeners
  public addListener<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback: (...args: ExtractEvents<Configuration["extensions"]>[K]) => any, identifier?: string) {
    return this.eventBus.addCallback(event, callback, false, identifier)
  }

  public addListenerOnce<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback: (...args: ExtractEvents<Configuration["extensions"]>[K]) => any, identifier?: string) {
    return this.eventBus.addCallback(event, callback, true, identifier)
  }

  public removeListener<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback?: ((...args: ExtractEvents<Configuration["extensions"]>[K]) => any) | EventIdentifier) {
    return this.eventBus.removeCallback(event, callback)
  }


  // Other stuff
  public findRoute(request: ExchangeRequest) {
    const converter = this.resolveConverter()

    return converter.fetchRoute(request, this.currentTask)
  }

  public async createQuotaFromRoute(from: Address, route: SimulatedRoute) {
    const request = this.routeToRequest(route)
    const converter = this.resolveConverter()

    if (route.tokenIn.network === route.tokensOut[0].network) {
      if (ExchangeUtils.isWrapUnwrap(route)) {
        const wrapUnwrap = converter.createSingleChainWrapUnwrapTransaction(request)

        if (wrapUnwrap instanceof SdkException) return wrapUnwrap

        return wrapUnwrap
      }

      if (!route) return new SdkException("Route not selected", SdkExceptionCode.InvalidRequest)

      const singleChainTransactions = await converter.createSingleChainTransaction(from, route, this.currentTask)

      if (singleChainTransactions instanceof SdkException) return singleChainTransactions

      return singleChainTransactions
    }

    return converter.createMultiChainTransaction(from, request, this.currentTask)
  }

  public extension<T extends new (...args: any[]) => SdkExtension>(extension: T): InstanceTypeOf<T> {
    const extensionInstance = this._extensions.find(e => e.name === extension.name)

    if (!extensionInstance) throw new SdkException(`Call to non-existent extension ${ extension.name }`, SdkExceptionCode.ExtensionError)

    return extensionInstance as any
  }

  public withExtension<T extends new (...args: any[]) => SdkExtension, R = any>(extension: T, callback: (instance: InstanceTypeOf<T>) => R): R | null {
    try {
      const extensionInstance = this.extension(extension)

      return callback(extensionInstance)
    }
    catch {
      return null
    }
  }

  protected attachExtensions(extensions: ExtractConfigExtensionsType<Configuration["extensions"]>, instance: SafeBlock, allowInitErrors = true) {
    const nameRegex = /^(?!\d)(?!\d+$)[a-zA-Z][a-zA-Z0-9]*$/g

    if (this._extensions.length !== 0) throw new SdkException("Fatal error due extension initialization: attempted to initialize" +
      " extensions twice", SdkExceptionCode.ExtensionInitError)

    const processExtensionInitializationError = (extension: SdkExtension, index: number, message: string) => {
      this.sdkConfig.debugLogListener?.(`Init: Error due ${ extension.name } (#${index}) initialization: ${ message }`)

      if (!allowInitErrors) throw new SdkException(message, SdkExceptionCode.ExtensionInitError)
    }

    extensions.forEach((extension, index) => {
      const initException = processExtensionInitializationError.bind(this, extension, index)

      if (!(extension instanceof SdkExtension))
        return initException(`Extension cannot be processed due to invalid constructor`)

      if (extension.name === "SdkExtension") return initException("Cannot use default name for extension initialization")

      // Init cycle
      const eventNamesList: string[] = []

      this._extensions.forEach(existingExtension => {
        eventNamesList.push(...Object.keys(existingExtension.events).map(name => name.toLowerCase()))
      })

      if (this._extensions.some(ex => ex.name === extension.name))
        return initException("Extension with same name already initialized")

      const duplicateEventNamesFound = Object.keys(extension.events).map(i => i.toLowerCase())
        .some(extensionEventNames => eventNamesList.includes(extensionEventNames))

      if (duplicateEventNamesFound)
        return initException("Extension attempted to declare events that already been declared by another extension")

      if (Object.keys(extension.events).some(eventName => eventName.match(nameRegex)?.[0] !== eventName || eventName.trim().length <= 4))
        return initException("Extension attempted to declare event with invalid name")

      try {
        extension.onInitialize(instance)

        this._extensions.push(extension)
      } catch (e: any) {
        initException(`Initialization method raised error: ${ e?.message?.toString() ?? "cannot extract error message" }`)
      }
    })
  }

  private resolveConverter() {
    return new EvmConverter(this, this.sdkConfig, this.mixins)
  }

  private routeToRequest(route: SimulatedRoute): ExchangeRequest {
    return {
      ...route,
      exactInput: route.isExactInput
    }
  }
}
