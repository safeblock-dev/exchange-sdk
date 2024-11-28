import { Address, Amount, ton } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import { OffchainOracle__factory } from "~/abis/types"
import { contractAddresses } from "~/config"
import { BackendResponse, MultiCallRequest } from "~/types"
import ArrayUtils from "~/utils/array-utils"
import multicall from "~/utils/multicall"
import request from "~/utils/request"
import TokensList, { BasicToken } from "~/utils/tokens-list"

export default class PriceStorage {
  readonly #prices: Map<string, Map<string, bigint>>

  #updateTimestamp = 0
  #fetchingPrices = false
  #workerInterval: any
  #currentFetchingTask = Symbol()
  #initialFetchFinished = false

  constructor(private readonly tokensList: TokensList, private readonly updateInterval: number = 6000) {
    this.#prices = new Map()

    this.pricesWorker = this.pricesWorker.bind(this)
    this.forceRefetch = this.forceRefetch.bind(this)

    this.pricesWorker().finally(() => {
      this.setupWorkerInterval()
      this.#initialFetchFinished = true
    })
  }

  public async waitInitialFetch() {
    if (this.#initialFetchFinished) return

    return new Promise<void>(resolve => {
      const interval = setInterval(() => {
        if (!this.#initialFetchFinished) return

        resolve()
        clearInterval(interval)
      }, 100)
    })
  }

  private setupWorkerInterval() {
    if (this.#workerInterval) clearInterval(this.#workerInterval)

    this.#workerInterval = setInterval(() => this.pricesWorker(), this.updateInterval)
  }

  private async fetchTonTokenPrices() {
    const ratesList = await request<BackendResponse.TON.TokenRates>({
      base: "https://tonapi.io",
      path: "/v2/rates",
      query: {
        tokens: this.tokensList.list(ton).map(t => t.address.toString()).join(","),
        currencies: "usd"
      }
    })

    if (!ratesList) return

    Object.entries(ratesList.rates).forEach(([ jettonAddress, data ]) => {
      const jetton = this.tokensList.get(ton, Address.from(jettonAddress))
      if (!jetton) return

      this.#prices.get(ton.name)?.set(jetton.address.toString(), Amount.from(data.prices.USD, jetton.decimals, true).toBigInt())
    })
  }

  private async fetchTokenPrices(network: Network, task: Symbol) {
    if (!this.#prices.has(network.name)) this.#prices.set(network.name, new Map())

    if (network.name === ton.name) return this.fetchTonTokenPrices()

    const usdt = contractAddresses.usdtParams(network)

    if (!usdt) return

    const requests: MultiCallRequest[] = this.tokensList
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

    let rates = await ArrayUtils.asyncNonNullable(
      ArrayUtils.asyncMap(
        multicall<[ BigInt ]>(network, requests),
        (response) => {
          if (!response.data) return null

          const token = this.tokensList
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

    const usdtRate = rates.find((r) => Address.equal(r.token.address, usdt.address))?.rate

    if (!usdtRate) return

    rates.forEach((rate) => {
      if (Address.equal(rate.token.address, usdt.address)) {
        this.#prices.get(network.name)?.set(rate.token.address.toString(), BigInt(10 ** usdt.decimals))
      }
      else {
        this.#prices.get(network.name)?.set(rate.token.address.toString(), (rate.rate * BigInt(10 ** rate.token.decimals)) / usdtRate)
      }
    })

    const nativeRate = (BigInt(1e18) * BigInt(1e18)) / usdtRate
    this.#prices.get(network.name)?.set(Address.wrappedOf(network), nativeRate)
    this.#prices.get(network.name)?.set(Address.zeroAddress, nativeRate)
  }

  private async pricesWorker(forceTask?: symbol) {
    if (Date.now() - this.#updateTimestamp < this.updateInterval || this.#fetchingPrices) return

    this.#fetchingPrices = true

    const task = forceTask ?? Symbol()
    this.#currentFetchingTask = task

    return Promise.all(this.tokensList.networks.map(network => this.fetchTokenPrices(network, task).catch(() => null))).finally(() => {
      this.#fetchingPrices = false
      this.#updateTimestamp = Date.now()
    })
  }

  public async forceRefetch() {
    this.#updateTimestamp = 0
    this.#fetchingPrices = false

    if (this.#workerInterval) clearInterval(this.#workerInterval)

    const task = Symbol()
    this.#currentFetchingTask = task

    try {
      return await this.pricesWorker(task)
    }
    finally {
      this.setupWorkerInterval()
    }
  }

  // Getters

  public getFormattedPrice(tokenOrNetwork: Network, address: Address): number
  public getFormattedPrice(tokenOrNetwork: BasicToken): number

  public getFormattedPrice(tokenOrNetwork: BasicToken | Network, address?: Address): number {
    const network = "name" in tokenOrNetwork ? tokenOrNetwork : tokenOrNetwork.network
    const tokenAddress = "name" in tokenOrNetwork ? address! : tokenOrNetwork.address

    const existingToken = this.tokensList.get(network, tokenAddress)

    if (!existingToken) return 0

    const price = this.getPrice(network, tokenAddress)

    return parseFloat((parseInt(price.toString()) * (10 ** -existingToken.decimals)).toFixed(existingToken.decimals))
  }

  public getPrice(tokenOrNetwork: Network, address: Address): Amount
  public getPrice(tokenOrNetwork: BasicToken): Amount

  public getPrice(tokenOrNetwork: BasicToken | Network, address?: Address): Amount {
    const network = "name" in tokenOrNetwork ? tokenOrNetwork : tokenOrNetwork.network
    const tokenAddress = "name" in tokenOrNetwork ? address! : tokenOrNetwork.address

    const existingToken = this.tokensList.get(network, tokenAddress)

    if (!existingToken) return new Amount(0, 0, false)

    return Amount.from(this.#prices.get(network.name)?.get(tokenAddress.toString()) ?? BigInt(0), existingToken.decimals, false)
  }
}