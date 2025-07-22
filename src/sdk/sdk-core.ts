import { Address } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import EvmConverter from "~/sdk/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import SafeBlock from "~/sdk/index"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import SdkExtension, { ExtractConfigExtensionsType, ExtractEvents } from "~/sdk/sdk-extension"
import { InternalMixinList, SdkMixins } from "~/sdk/sdk-mixins"
import StateManager from "~/sdk/state-manager"
import { ExchangeQuota, ExchangeRequest, SimulatedRoute } from "~/types"
import EventBus, { EventIdentifier } from "~/utils/event-bus"

type TAddressesList = { [p: string]: string } & { default: string }

type InstanceTypeOf<T extends new (...args: any) => any> = T extends new (...args: any) => infer R ? R : never

export interface ExtensionInitializeEnvironment<T extends EventBus<any>> {
  sdk: SafeBlock
  config: SdkConfig
  eventBus: T
  mixins: SdkMixins
}

/**
 * SDK configuration
 */
export type SdkConfig = Partial<{
  /**
   * Maximum allowed price‑impact difference between input
   * and output (%). Applies to valid routes only.
   *
   * @default 20
   */
  routePriceDifferenceLimit: number

  /**
   * Custom handler for incoming SDK debug messages
   *
   * @param message debug message
   */
  debugLogListener: (...message: any[]) => void

  /**
   * Maximum number of routes, not counting direct swap routes
   *
   * @default 3
   */
  routesCountLimit: number

  /**
   * Absolute maximum number of swap routes per request
   *
   * @default 30
   */
  routesCountHardLimit: number

  /**
   * > Advanced option
   *
   * Provide custom mappings for network names
   */
  customNetworkMappings: Record<string, Network>

  /**
   * List of SDK extensions
   *
   * @param {ExtensionInitializeEnvironment} environment extension API surface
   * @returns {SdkExtension[]} array of extensions
   */
  extensions: <T extends EventBus<any>>(environment: ExtensionInitializeEnvironment<T>) => SdkExtension[]

  /**
   * If `true`, extensions that fail during initialization will
   * **not** cause an SDK init error. Such extensions are simply
   * disabled.
   *
   * > Use with caution: a direct call to a disabled extension will
   * > still raise an error.
   *
   * @default false
   */
  allowExtensionsInitErrors: boolean

  /**
   * > Advanced option
   *
   * Custom addresses for certain contracts
   */
  contractAddresses: Partial<{
    entryPoint: TAddressesList
    quoter: TAddressesList
  }>

  /**
   * Custom backend URL and headers for route calculation
   */
  backend: {
    url: string
    headers?: Record<string, string>

    /**
     * Routes query cache lifetime in ms
     * @default 30_000
     */
    cacheTime?: number
  }

  /**
   * Custom backend URL and headers for bridge aggregation
   *
   * _Stargate will be used if not provided_
   */
  bridgeAggregationBackend?: SdkConfig["backend"]
}>

/**
 * SDK core
 */
export default class SdkCore<Configuration extends SdkConfig = SdkConfig> extends StateManager {
  protected readonly eventBus = new EventBus<ExtractEvents<Configuration["extensions"]>>()
  protected readonly sdkConfig: SdkConfig
  public _extensions: ExtractConfigExtensionsType<Configuration["extensions"]> = [] as any

  protected readonly mixins = new SdkMixins()

  constructor(sdkConfig?: Configuration) {
    super()

    this.sdkConfig = sdkConfig ?? {}
  }

  // ───────────────────────── Mixins ─────────────────────────

  /**
   * Register a mixin that mutates specific logic
   *
   * @param location   global namespace the mixin belongs to
   * @param namespace  local namespace the mixin belongs to
   * @param breakpoint mixin name (logical breakpoint)
   * @param callback   function that mutates the value
   * @returns {string} mixin identifier
   */
  public addMixin<
    Location extends keyof InternalMixinList,
    Namespace extends keyof InternalMixinList[Location],
    Breakpoint extends keyof InternalMixinList[Location][Namespace],
    Value extends InternalMixinList[Location][Namespace][Breakpoint]
  >(location: Location, namespace: Namespace, breakpoint: Breakpoint, callback: (value: Value) => Value): string {
    return this.mixins.addMixin(location, namespace, breakpoint, callback)
  }

  /**
   * Remove a mixin by its identifier
   *
   * @param {string} identifier mixin ID returned by `addMixin`
   */
  public removeMixin(identifier: string) {
    this.mixins.removeMixin(identifier)
  }

  // ─────────────────────── Event listeners ───────────────────────

  /**
   * Add a new event listener
   *
   * @param event      event to listen for
   * @param callback   function invoked when the event fires
   * @param identifier optional listener ID
   * @returns {EventIdentifier} pointer to the registered listener
   */
  public addListener<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback: (...args: ExtractEvents<Configuration["extensions"]>[K]) => any, identifier?: string): EventIdentifier {
    return this.eventBus.addCallback(event, callback, false, identifier)
  }

  /**
   * Add an event listener that will fire only once
   *
   * @param event      event to listen for
   * @param callback   function invoked once when the event fires
   * @param identifier optional listener ID
   * @returns {EventIdentifier} pointer to the registered listener
   */
  public addListenerOnce<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback: (...args: ExtractEvents<Configuration["extensions"]>[K]) => any, identifier?: string): EventIdentifier {
    return this.eventBus.addCallback(event, callback, true, identifier)
  }

  /**
   * Remove an event listener
   *
   * @param event    event name
   * @param callback registered function or its identifier
   * @returns {boolean} removal result
   */
  public removeListener<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback?: ((...args: ExtractEvents<Configuration["extensions"]>[K]) => any) | EventIdentifier): boolean {
    return this.eventBus.removeCallback(event, callback)
  }

  // ───────────────────────── Other logic ─────────────────────────

  /**
   * Find a swap route that satisfies the provided request
   *
   * > In many cases `createQuota` is more efficient, as it combines
   * > `findRoute` and `createQuotaFromRoute`.
   *
   * @param {ExchangeRequest} request swap request
   * @param signal abort controller signal
   * @returns {Promise<SdkException | SimulatedRoute>} `SdkException` or a `SimulatedRoute`
   */
  public findRoute(request: ExchangeRequest, signal?: AbortSignal): Promise<SdkException | SimulatedRoute> {
    const converter = this.resolveConverter()

    return converter.fetchRoute(request, this.currentTask, signal)
  }

  /**
   * Create a quota from a pre‑computed swap route
   *
   * > In many cases `createQuota` is more efficient, as it combines
   * > `findRoute` and `createQuotaFromRoute`.
   *
   * @param from  user address initiating the swap
   * @param route simulated swap route
   * @param signal abort controller signal
   * @returns {Promise<ExchangeQuota | SdkException>} `SdkException` or an `ExchangeQuota`
   */
  public async createQuotaFromRoute(from: Address, route: SimulatedRoute, signal?: AbortSignal): Promise<ExchangeQuota | SdkException> {
    const request = this.routeToRequest(route)
    const converter = this.resolveConverter()

    if (route.tokenIn.network === route.tokensOut[0].network) {
      if (ExchangeUtils.isWrapUnwrap(route)) {
        const wrapUnwrap = converter.createSingleChainWrapUnwrapTransaction(request)

        if (wrapUnwrap instanceof SdkException) return wrapUnwrap

        return wrapUnwrap
      }

      if (!route) return new SdkException("Route not selected", SdkExceptionCode.InvalidRequest)

      if (signal?.aborted) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

      const singleChainTransactions = await converter.createSingleChainTransaction(from, this.routeToRequest(route), route, this.currentTask, signal)

      if (singleChainTransactions instanceof SdkException) return singleChainTransactions
      if (signal?.aborted) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

      return singleChainTransactions
    }

    return converter.createMultiChainTransaction(from, request, this.currentTask)
  }

  /**
   * Directly access a registered extension.
   *
   * > Use with caution: calling an extension that was not registered
   * > or was disabled during initialization will throw `SdkException`.
   * > This is one of the few methods that **throws** rather than returns errors.
   *
   * @param extension extension class to retrieve
   * @returns extension instance
   * @throws {SdkException} `ExtensionError`
   */
  public extension<T extends new (...args: any[]) => SdkExtension>(extension: T): InstanceTypeOf<T> {
    const extensionInstance = this._extensions.find(e => e.name === extension.name)

    if (!extensionInstance) throw new SdkException(`Call to non-existent extension ${ extension.name }`, SdkExceptionCode.ExtensionError)

    return extensionInstance as any
  }

  /**
   * Safer alternative to `extension`. Executes the callback
   * only if the extension is available.
   *
   * @param extension extension class to retrieve
   * @param callback  callback invoked with the extension instance
   * @returns callback result or `null`
   */
  public withExtension<T extends new (...args: any[]) => SdkExtension, R = any>(extension: T, callback: (instance: InstanceTypeOf<T>) => R): R | null {
    try {
      const extensionInstance = this.extension(extension)

      return callback(extensionInstance)
    }
    catch {
      return null
    }
  }

  /**
   * Internal routine that validates, initializes and registers
   * all provided extensions.
   *
   * @param extensions      list of extensions
   * @param instance        SDK instance
   * @param allowInitErrors allow initialization errors
   * @protected
   */
  protected attachExtensions(extensions: ExtractConfigExtensionsType<Configuration["extensions"]>, instance: SafeBlock, allowInitErrors: boolean = true) {
    const nameRegex = /^(?!\d)(?!\d+$)[a-zA-Z][a-zA-Z0-9]*$/g

    if (this._extensions.length !== 0) throw new SdkException("Fatal error due extension initialization: attempted to initialize" +
      " extensions twice", SdkExceptionCode.ExtensionInitError)

    const processExtensionInitializationError = (extension: SdkExtension, index: number, message: string) => {
      this.sdkConfig.debugLogListener?.(`Init: Error due ${ extension.name } (#${ index }) initialization: ${ message }`)

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

      this._extensions.push(extension)
    })

    this._extensions.forEach((extension, index) => {
      try {
        extension.onInitialize(instance)
      }
      catch (e: any) {
        this._extensions.filter(ext => ext.name !== extension.name)
        processExtensionInitializationError(
          extension, index,
          `Initialization method raised error: ${ e?.message?.toString() ?? "cannot extract error message" }`
        )
      }
    })
  }

  /**
   * Previously used to resolve the converter for route calculations.
   * Currently just a placeholder for future functionality.
   *
   * @returns {EvmConverter} converter instance
   * @private
   */
  private resolveConverter(): EvmConverter {
    return new EvmConverter(this, this.sdkConfig, this.mixins)
  }

  /**
   * Convert a simulated route into an exchange request
   *
   * @param route simulated route
   * @returns exchange request
   * @private
   */
  private routeToRequest(route: SimulatedRoute): ExchangeRequest {
    return {
      ...route,
      exactInput: route.isExactInput
    }
  }
}
