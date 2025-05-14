import { Address, Amount, arrayUtils, multicall, MultiCallRequest } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import { OffchainOracle__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import { TokensListExtension } from "~/extensions"
import SafeBlock from "~/sdk"
import SdkExtension, { PartialEventBus } from "~/sdk/sdk-extension"
import { BasicToken } from "~/types"


const events = {
  /** Fired after the first successful price update */
  onPriceStorageInitialLoadFinished: () => null,

  /** Fired after each subsequent price update */
  onPriceStoragePricesUpdated: () => null,

  /** Fired when `forceRefetch` is invoked */
  onPriceStorageForceRefetch: () => null
}


interface IPriceStorageExtensionConfig {
  /** Automatic price‑update interval in ms */
  updateInterval?: number
  /** Minimum ms that must elapse between `forceRefetch` calls */
  forceRefetchTimeout?: number
}


/**
 * SDK extension that manages prices of registered tokens.
 *
 * Requires the following extension:
 * - `TokensListExtension`
 */
export default class PriceStorageExtension extends SdkExtension {
  static override name = "PriceStorageExtension"

  public events = events

  private readonly _prices: Map<string, Map<string, bigint>>

  #updateTimestamp = 0
  #fetchingPrices = false
  #currentFetchingTask = Symbol()
  #initialFetchFinished = false
  #forceRefetchTimeout: any

  public onInitialize(): void {
    this.waitInitialFetch(100).then(() => {
      this.eventBus.emitEvent("onPriceStorageInitialLoadFinished")
    })

    this.requestPricesUpdate().finally(() => {
      this.#initialFetchFinished = true
    })
  }

  /**
   * SDK extension that manages prices of registered tokens.
   *
   * Requires the following extension:
   * - `TokensListExtension`
   *
   * @param {SafeBlock}                      sdk     SDK instance
   * @param {PartialEventBus<typeof events>} eventBus partial event bus
   * @param {IPriceStorageExtensionConfig}   config  extension configuration
   */
  constructor(
    private readonly sdk: SafeBlock,
    private readonly eventBus: PartialEventBus<typeof events>,
    private readonly config?: IPriceStorageExtensionConfig
  ) {
    super()

    this._prices = new Map()

    this.requestPricesUpdate = this.requestPricesUpdate.bind(this)
    this.forceRefetch = this.forceRefetch.bind(this)
  }

  /**
   * Wait until the initial price update is complete. If prices were already
   * updated at least once, the promise resolves immediately.
   *
   * @param {number} pollingInterval polling interval in ms
   * @returns {Promise<void>} resolves after the first price update
   */
  public async waitInitialFetch(pollingInterval: number = 100): Promise<void> {
    if (this.#initialFetchFinished) return

    return new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (!this.#initialFetchFinished) return

        resolve()
        clearInterval(interval)
      }, pollingInterval)
    })
  }

  private async fetchTokenPrices(network: Network, task: Symbol) {
    if (!this._prices.has(network.name)) this._prices.set(network.name, new Map())

    const usdc = contractAddresses.usdcParams(network)

    if (!usdc) return

    const requests: MultiCallRequest[] = this.sdk.extension(TokensListExtension)
      .list(network)
      .filter(
        (token) =>
          !Address.isZero(token.address) &&
          !Address.equal(token.address, Address.wrappedOf(network))
      )
      .map((token) => ({
        target: Address.from(contractAddresses.offchainOracle(network)),
        contractInterface: OffchainOracle__factory,
        calls: [
          {
            method: "getRate",
            reference: token.address.toString(),
            methodParameters: [
              token.address.toString(),
              Address.wrappedOf(network),
              false
            ]
          }
        ]
      }))

    if (requests.length === 0) return

    let rates = await arrayUtils.asyncNonNullable(
      arrayUtils.asyncMap(
        multicall<[BigInt]>(network, requests),
        (response) => {
          if (!response.data) return null

          const token = this.sdk.extension(TokensListExtension)
            .list(network)
            .find((t) => Address.equal(t.address, response.reference ?? ""))

          if (!token) return null

          const numerator = BigInt(10) ** BigInt(token.decimals)
          const denominator = BigInt(10) ** BigInt(18)

          if (!response.data[0]) return null

          return {
            token: token,
            rate: (BigInt(response.data[0].toString()) * numerator) / denominator
          }
        }
      )
    )

    if (task !== this.#currentFetchingTask) return

    const usdcRate = rates.find((r) => Address.equal(r.token.address, usdc.address))?.rate
    if (!usdcRate) return

    rates.forEach((rate) => {
      if (Address.equal(rate.token.address, usdc.address)) {
        this._prices.get(network.name)?.set(rate.token.address.toString(), BigInt(10 ** usdc.decimals))
      }
      else {
        this._prices.get(network.name)?.set(rate.token.address.toString(), (rate.rate * BigInt(10 ** rate.token.decimals)) / usdcRate)
      }
    })

    const nativeRate = (BigInt(1e18) * BigInt(1e18)) / usdcRate
    this._prices.get(network.name)?.set(Address.wrappedOf(network), nativeRate)
    this._prices.get(network.name)?.set(Address.zeroAddress, nativeRate)
  }

  /**
   * Request a price refresh. A new request is issued only if none is
   * currently in progress.
   *
   * @param {symbol} forceTask if set, cancels the current request and starts a new one
   * @returns {Promise<void>}
   */
  public async requestPricesUpdate(forceTask?: symbol): Promise<void> {
    if (Date.now() - this.#updateTimestamp < (this.config?.updateInterval ?? 6000) || this.#fetchingPrices) return

    this.#fetchingPrices = true

    const task = forceTask ?? Symbol()
    this.#currentFetchingTask = task

    await Promise.all(this.sdk.extension(TokensListExtension)
      .networks.map(async network => await this.fetchTokenPrices(network, task).catch(() => null)))
      .finally(() => {
        this.#fetchingPrices = false
        this.#updateTimestamp = Date.now()
      }).finally(() => this.eventBus.emitEvent("onPriceStoragePricesUpdated"))
  }

  /**
   * Force a price refresh.
   *
   * @returns {Promise<void>}
   */
  public async forceRefetch(): Promise<void> {
    if (this.#forceRefetchTimeout) clearTimeout(this.#forceRefetchTimeout)

    return new Promise<void>(resolve => {
      this.#forceRefetchTimeout = setTimeout(async () => {
        this.#updateTimestamp = 0
        this.#fetchingPrices = false

        this.eventBus.emitEvent("onPriceStorageForceRefetch")

        const task = Symbol()
        this.#currentFetchingTask = task

        try {
          return await this.requestPricesUpdate(task)
        }
        finally {
          resolve()
        }
      }, this.config?.forceRefetchTimeout ?? 200)
    })
  }

  /**
   * Get the price of a specific token.
   *
   * @param {Network} tokenOrNetwork network of the token
   * @param {Address} address        token address
   * @returns {Amount} token price
   */
  public getPrice(tokenOrNetwork: Network, address: Address): Amount

  /**
   * Get the price of a specific token.
   *
   * @param {BasicToken} tokenOrNetwork token object
   * @returns {Amount} token price
   */
  public getPrice(tokenOrNetwork: BasicToken): Amount

  /**
   * Get the price of a specific token.
   *
   * @param {BasicToken | Network} tokenOrNetwork token object or network
   * @param {Address}              address        token address
   * @returns {Amount} token price
   */
  public getPrice(tokenOrNetwork: BasicToken | Network, address?: Address): Amount {
    const network = "name" in tokenOrNetwork ? tokenOrNetwork : tokenOrNetwork.network
    const tokenAddress = "name" in tokenOrNetwork ? address! : tokenOrNetwork.address

    const existingToken = this.sdk.extension(TokensListExtension).get(network, tokenAddress)

    if (!existingToken) return new Amount(0, 0, false)

    return Amount.from(this._prices.get(network.name)?.get(tokenAddress.toString()) ?? BigInt(0), existingToken.decimals, false)
  }
}