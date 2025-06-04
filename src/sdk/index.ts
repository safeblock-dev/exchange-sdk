import { Address } from "@safeblock/blockchain-utils"
import BigNumber from "bignumber.js"
import { ethers, JsonRpcSigner } from "ethers"
import SdkCore, { type SdkConfig } from "~/sdk/sdk-core"
import { ExtractConfigExtensionsType } from "~/sdk/sdk-extension"
import { ExchangeRequest, ExecutorCallData } from "~/types"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"


type GenericBlacklist<I extends string, S extends string> = Array<{ [key: string]: any } & { [key in I]: string } & { [key in S]: boolean }>

/**
 * A powerful and easy-to-use SDK for seamless cross-chain and on-chain crypto swaps
 *
 * https://github.com/safeblock-dev/exchange-sdk/blob/main/README.md
 */
export default class SafeBlock<Configuration extends SdkConfig = SdkConfig> extends SdkCore<Configuration> {
  public constructor(sdkConfig?: Configuration) {
    super(sdkConfig)

    // Initialize extensions
    let extensions: ExtractConfigExtensionsType<Configuration["extensions"]> = [] as any

    if (!this.sdkConfig.extensions) return

    extensions = this.sdkConfig.extensions<typeof this.eventBus>({
      sdk: this,
      eventBus: this.eventBus,
      config: this.sdkConfig,
      mixins: this.mixins
    }) as ExtractConfigExtensionsType<Configuration["extensions"]>

    if (extensions.length === 0) return

    const extensionNames = extensions.map(ext => ext.name)
    this.sdkConfig.debugLogListener?.(`Init: Loading extensions (${ extensionNames.length }): ${ extensionNames.join(", ") }`)

    super.attachExtensions(extensions, this, this.sdkConfig.allowExtensionsInitErrors)

    this.sdkConfig.debugLogListener?.(`Init: Successfully initialized ${ this._extensions.length } extensions`)

    // @ts-ignore
    this.eventBus.emitEvent("onExtensionsInitializationFinished", extensionNames)
  }

  /**
   * Synchronize the exchange blacklist with the SDK.
   * Accepts any `GenericBlacklist`‑shaped object that must contain, at minimum,
   * the exchange identifier and its status.
   *
   * @param idFieldName   field name that holds the exchange identifier
   * @param stateFieldName field name that holds the exchange status
   * @param {GenericBlacklist} list the blacklist object
   */
  public syncDexBlacklists<I extends string, S extends string>(idFieldName: I, stateFieldName: S, list: GenericBlacklist<I, S>) {
    this.dexBlacklist.clear()
    list.forEach(item => {
      const id = item[idFieldName]
      const state = item[stateFieldName]

      if (!state) this.dexBlacklist.add(id)
    })

    this.sdkConfig.debugLogListener?.("DEX blacklists synced")
  }

  /**
   * Shortcut that fetches the best route for the given request and immediately builds a quota.
   *
   * @param {Address}          from    user address performing the swap
   * @param {ExchangeRequest}  request swap request
   * @param {symbol}           task    current task symbol
   * @returns an `SdkException` or an `ExchangeQuota`
   */
  public async createQuota(from: Address, request: ExchangeRequest, task: symbol) {
    const routes = await this.findRoute(request)

    if (!this.verifyTask(task)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    if (routes instanceof SdkException) return routes

    const quota = this.createQuotaFromRoute(from, routes)

    if (!this.verifyTask(task)) return new SdkException("Task aborted", SdkExceptionCode.Aborted)

    const content = await quota

    if (content instanceof SdkException) return content

    this.sdkConfig.debugLogListener?.(`Quota: Built: ${ JSON.stringify(content.executorCallData.map(c => ({ data: c.callData, value: c.value?.toString() }))) }`)

    return content
  }

  /**
   * Shortcut that prepares transactions in the format expected by `ethers`.
   *
   * @param {ExecutorCallData}      data   transaction data (`ExecutorCallData`)
   * @param {JsonRpcSigner}         signer an `ethers`‑compatible `JsonRpcSigner`
   * @returns {Promise<SdkException | ethers.TransactionRequest>} an `SdkException`
   *          or an `ethers.TransactionRequest`
   */
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
