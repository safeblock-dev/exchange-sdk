import { Address } from "@safeblock/blockchain-utils"
import EvmConverter from "~/sdk/evm-converter"
import { ExchangeUtils } from "~/sdk/exchange-utils"
import SafeBlock from "~/sdk/index"
import SdkExtension, { ExtractConfigExtensionsType, ExtractEvents } from "~/sdk/sdk-extension"
import { SdkMixins } from "~/sdk/sdk-mixins"
import StateManager from "~/sdk/state-manager"
import { BasicToken, ExchangeRequest, SimulatedRoute } from "~/types"
import EventBus, { EventIdentifier } from "~/utils/event-bus"
import SdkException, { SdkExceptionCode } from "~/utils/sdk-exception"

type TAddressesList = { [p: string]: string } & { default: string }

interface ExtensionInitializeEnvironment<T extends EventBus<any>> {
  sdk: SafeBlock,
  config: SdkConfig,
  eventBus: T
}

export type SdkConfig = Partial<{
  tokensList: Record<string, BasicToken[]> | Map<string, BasicToken[]> | [string, BasicToken[]][]
  routePriceDifferenceLimit: number

  debugLogListener: (...message: any[]) => void

  routesCountLimit: number
  routesCountHardLimit: number

  extensions: <T extends EventBus<any>> (environment: ExtensionInitializeEnvironment<T>) => SdkExtension[]

  contractAddresses: Partial<{
    entryPoint: TAddressesList
    quoter: TAddressesList
  }>

  backend: {
    url: string
    headers?: Record<string, string>
  }

  priceStorage: Partial<{
    updateInterval: number
  }>
}>

type InstanceTypeOf<T extends new (...args: any) => any> = T extends new (...args: any) => infer R ? R : never

export default class SdkCore<Configuration extends SdkConfig = SdkConfig> extends StateManager {
  protected readonly eventBus = new EventBus<ExtractEvents<Configuration["extensions"]>>()
  protected readonly sdkConfig: SdkConfig
  protected _extensions: ExtractConfigExtensionsType<Configuration["extensions"]> = [] as any

  public readonly mixins = new SdkMixins()

  constructor(sdkConfig?: Configuration) {
    super()

    this.sdkConfig = sdkConfig ?? {}
  }

  // Event listeners
  public addListener<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback: (...args: ExtractEvents<Configuration["extensions"]>[K]) => any, identifier?: string) {
    this.eventBus.addCallback(event, callback, false, identifier)
  }

  public addListenerOnce<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback: (...args: ExtractEvents<Configuration["extensions"]>[K]) => any, identifier?: string) {
    this.eventBus.addCallback(event, callback, true, identifier)
  }

  public removeListener<K extends keyof ExtractEvents<Configuration["extensions"]>>(event: K, callback?: ((...args: ExtractEvents<Configuration["extensions"]>[K]) => any) | EventIdentifier) {
    this.eventBus.removeCallback(event, callback)
  }


  // Other stuff
  public findRoutes(request: ExchangeRequest) {
    const converter = this.resolveConverter()

    return converter.fetchRoutes(request, this.currentTask)
  }

  public async createQuotaFromRoute(from: Address, route: SimulatedRoute) {
    const request = this.routeToRequest(route)
    const converter = this.resolveConverter()

    if (route.tokenIn.network === route.tokenOut.network) {
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
    } catch {
      return null
    }
  }

  protected attachExtensions(extensions: ExtractConfigExtensionsType<Configuration["extensions"]>) {
    const eventNamesList: string[] = []
    const nameRegex = /^(?!\d)(?!\d+$)[a-zA-Z][a-zA-Z0-9]*$/g

    extensions.forEach(extension => {
      eventNamesList.push(...Object.keys(extension.events).map(name => name.toLowerCase()))

      if (extension.name === "SdkExtension") throw new SdkException("Cannot use default name for extension initialization",
        SdkExceptionCode.ExtensionInitError)
    })

    if (new Set(eventNamesList).size !== eventNamesList.length) throw new SdkException(
      "Cannot register identical event names in multiple extensions",
      SdkExceptionCode.ExtensionInitError
    )

    eventNamesList.forEach(eventName => {
      if (eventName.match(nameRegex)?.[0] === eventName) return

      throw new SdkException(`Cannot register invalid event name ${eventName}`, SdkExceptionCode.ExtensionInitError)
    })

    this._extensions = extensions
  }

  private resolveConverter() {
    return new EvmConverter(this, this.sdkConfig)
  }

  private routeToRequest(route: SimulatedRoute): ExchangeRequest {
    return {
      ...route,
      exactInput: route.isExactInput
    }
  }
}
