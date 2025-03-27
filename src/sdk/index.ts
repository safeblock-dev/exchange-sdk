import { Address } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { ethers, JsonRpcSigner } from "ethers"
import SdkCore, { SdkConfig } from "~/sdk/sdk-core"
import { ExtractConfigExtensionsType } from "~/sdk/sdk-extension"
import { ExchangeRequest, ExecutorCallData } from "~/types"
import SdkException, { SdkExceptionCode } from "~/utils/sdk-exception"


type GenericBlacklist<I extends string, S extends string> = Array<{ [key: string]: any } & { [key in I]: string } & { [key in S]: boolean }>

export default class SafeBlock<Configuration extends SdkConfig = SdkConfig> extends SdkCore<Configuration> {
  public constructor(sdkConfig?: Configuration) {
    super(sdkConfig)

    // Initialize extensions
    let extensions: ExtractConfigExtensionsType<Configuration["extensions"]> = [] as any

    if (!this.sdkConfig.extensions) return

    extensions = this.sdkConfig.extensions<typeof this.eventBus>({
      sdk: this,
      eventBus: this.eventBus,
      config: this.sdkConfig
    }) as ExtractConfigExtensionsType<Configuration["extensions"]>

    if (extensions.length === 0) return

    const extensionNames = extensions.map(ext => ext.name)
    this.sdkConfig.debugLogListener?.(`Loading extensions: ${ extensionNames.join(", ") }`)

    if (new Set(extensionNames).size !== extensionNames.length) {
      throw new SdkException("Cannot initialize extensions with identical names", SdkExceptionCode.ExtensionInitError)
    }

    super.attachExtensions(extensions)

    extensions.forEach(extension => extension.onInitialize(this))

    this.sdkConfig.debugLogListener?.("All extensions initialized")

    // @ts-ignore
    this.eventBus.emitEvent("onExtensionsInitializationFinished", extensionNames)
  }

  public syncDexBlacklists<I extends string, S extends string>(idFieldName: I, stateFieldName: S, list: GenericBlacklist<I, S>) {
    this.dexBlacklist.clear()
    list.forEach(item => {
      const id = item[idFieldName]
      const state = item[stateFieldName]

      if (!state) this.dexBlacklist.add(id)
    })

    this.sdkConfig.debugLogListener?.("DEX blacklists synced")
  }

  public async createQuota(from: Address, request: ExchangeRequest, task: symbol) {
    const routes = await this.findRoutes(request)

    if (!this.verifyTask(task)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    if (routes instanceof SdkException) return routes
    if (routes.length === 0) return new SdkException("Routes not found", SdkExceptionCode.RoutesNotFound)

    const quota = this.createQuotaFromRoute(from, routes[0])
    if (!this.verifyTask(task)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    return quota
  }

  public async prepareEthersTransaction(data: ExecutorCallData, signer: JsonRpcSigner): Promise<SdkException | ethers.TransactionRequest> {
    const feeData = await signer.provider.getFeeData().catch(error => {
      return new SdkException("Cannot get fee data: " + String(error?.message), SdkExceptionCode.TransactionPrepareError)
    })

    if (feeData instanceof SdkException) return feeData

    const transactionDetails: ethers.TransactionRequest = {
      data: data.callData,
      chainId: data.network.chainId,
      value: data.value?.toBigNumber().toFixed(0),
      to: data.to.toString(),
      gasPrice: feeData.gasPrice
    }

    const estimation = await signer.estimateGas(transactionDetails).catch(error => {
      return new SdkException("Cannot estimate transaction: " + String(error?.message), SdkExceptionCode.TransactionPrepareError)
    })

    if (estimation instanceof SdkException) return estimation

    return {
      ...transactionDetails,
      gasLimit: new BigNumber(String(estimation)).multipliedBy(data.gasLimitMultiplier ?? 1).toFixed(0)
    }
  }
}

export { SdkConfig }
