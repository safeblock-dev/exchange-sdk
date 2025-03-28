import { Address, Amount, arrayUtils, multicall, MultiCallRequest } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import { OffchainOracle__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import { TokensListExtension } from "~/extensions"
import SafeBlock from "~/sdk"
import SdkExtension, { PartialEventBus } from "~/sdk/sdk-extension"
import { BasicToken } from "~/types"


const events = {
  onPriceStorageInitialLoadFinished: () => null,
  onPriceStoragePricesUpdated: () => null,
  onPriceStorageForceRefetch: () => null
}

interface IPriceStorageExtensionConfig {
  updateInterval?: number
  forceRefetchTimeout?: number
}

export default class PriceStorageExtension extends SdkExtension {
  static override name = "PriceStorageExtension"

  public events = events

  private readonly _prices: Map<string, Map<string, bigint>>

  #updateTimestamp = 0
  #fetchingPrices = false
  #workerInterval: any
  #currentFetchingTask = Symbol()
  #initialFetchFinished = false
  #forceRefetchTimeout: any

  public onInitialize(): void {
    this.waitInitialFetch(100).then(() => {
      this.eventsBus.emitEvent("onPriceStorageInitialLoadFinished")
    })

    this.pricesWorker().finally(() => {
      this.setupWorkerInterval()
      this.#initialFetchFinished = true
    })
  }

  constructor(
    private readonly sdk: SafeBlock,
    private readonly eventsBus: PartialEventBus<typeof events>,
    private readonly config?: IPriceStorageExtensionConfig
  ) {
    super()

    this._prices = new Map()

    this.pricesWorker = this.pricesWorker.bind(this)
    this.forceRefetch = this.forceRefetch.bind(this)
  }

  public async waitInitialFetch(pollingInterval = 100) {
    if (this.#initialFetchFinished) return

    return new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (!this.#initialFetchFinished) return

        resolve()
        clearInterval(interval)
      }, pollingInterval)
    })
  }

  private setupWorkerInterval() {
    if (this.#workerInterval) clearInterval(this.#workerInterval)

    this.#workerInterval = setInterval(() => this.pricesWorker(), this.config?.updateInterval ?? 6000)
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

  private async pricesWorker(forceTask?: symbol) {
    if (Date.now() - this.#updateTimestamp < (this.config?.updateInterval ?? 6000) || this.#fetchingPrices) return

    this.#fetchingPrices = true

    const task = forceTask ?? Symbol()
    this.#currentFetchingTask = task

    return Promise.all(this.sdk.extension(TokensListExtension)
      .networks.map(async network => await this.fetchTokenPrices(network, task).catch(() => null)))
      .finally(() => {
        this.#fetchingPrices = false
        this.#updateTimestamp = Date.now()
      }).finally(() => this.eventsBus.emitEvent("onPriceStoragePricesUpdated"))
  }

  public async forceRefetch() {
    if (this.#forceRefetchTimeout) clearTimeout(this.#forceRefetchTimeout)

    return new Promise<void>(resolve => {
      this.#forceRefetchTimeout = setTimeout(async () => {
        this.#updateTimestamp = 0
        this.#fetchingPrices = false

        this.eventsBus.emitEvent("onPriceStorageForceRefetch")

        if (this.#workerInterval) clearInterval(this.#workerInterval)

        const task = Symbol()
        this.#currentFetchingTask = task

        try {
          return await this.pricesWorker(task)
        }
        finally {
          resolve()
          this.setupWorkerInterval()
        }
      }, this.config?.forceRefetchTimeout ?? 200)
    })
  }

  // Getters

  public getFormattedPrice(tokenOrNetwork: Network, address: Address): number
  public getFormattedPrice(tokenOrNetwork: BasicToken): number

  public getFormattedPrice(tokenOrNetwork: BasicToken | Network, address?: Address): number {
    const network = "name" in tokenOrNetwork ? tokenOrNetwork : tokenOrNetwork.network
    const tokenAddress = "name" in tokenOrNetwork ? address! : tokenOrNetwork.address

    const existingToken = this.sdk.extension(TokensListExtension).get(network, tokenAddress)

    if (!existingToken) return 0

    const price = this.getPrice(network, tokenAddress)

    return parseFloat((parseInt(price.toString()) * (10 ** -existingToken.decimals)).toFixed(existingToken.decimals))
  }

  public getPrice(tokenOrNetwork: Network, address: Address): Amount
  public getPrice(tokenOrNetwork: BasicToken): Amount

  public getPrice(tokenOrNetwork: BasicToken | Network, address?: Address): Amount {
    const network = "name" in tokenOrNetwork ? tokenOrNetwork : tokenOrNetwork.network
    const tokenAddress = "name" in tokenOrNetwork ? address! : tokenOrNetwork.address

    const existingToken = this.sdk.extension(TokensListExtension).get(network, tokenAddress)

    if (!existingToken) return new Amount(0, 0, false)

    return Amount.from(this._prices.get(network.name)?.get(tokenAddress.toString()) ?? BigInt(0), existingToken.decimals, false)
  }
}
