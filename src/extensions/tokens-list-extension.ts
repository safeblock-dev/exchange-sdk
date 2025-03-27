import { Address, networksList } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import SafeBlock, { SdkConfig } from "~/sdk"
import PriceStorageExtension from "~/extensions/price-storage-extension"
import SdkExtension, { PartialEventBus } from "~/sdk/sdk-extension"
import { BasicToken } from "~/types"
import ArrayUtils from "~/utils/array-utils"

const events = {
  onTokenAdded: (token: BasicToken) => null,
  onTokenRemoved: (token: BasicToken) => null
}

type TInconsistentList = Record<string, BasicToken[]> | Map<string, BasicToken[]> | [ string, BasicToken[] ][]

export default class TokensListExtension extends SdkExtension {
  static override name = "TokensListExtension"

  public readonly events = events

  private readonly _tokensList: Map<string, BasicToken[]> = new Map()

  public onInitialize(): void {}

  constructor(
    private readonly sdk: SafeBlock,
    private readonly eventBus: PartialEventBus<typeof events>,
    config: SdkConfig,
  ) {
    super()

    this._tokensList = TokensListExtension.toConsistent(config.tokensList ?? {})
  }

  private static toConsistent(list: TInconsistentList) {
    if (list instanceof Map) return list

    return new Map(!Array.isArray(list) ? Object.entries(list) : list)
  }

  public exist(token: BasicToken) {
    const networkTokens = this._tokensList.get(token.network.name)

    if (!networkTokens) return false

    return Address.inArray(token.address, networkTokens.map(token => token.address))
  }

  public get(network: Network, address: Address): BasicToken | null {
    return this._tokensList.get(network.name)?.find(t => t.address.equalTo(address)) ?? null
  }

  public add(token: BasicToken) {
    if (this.exist(token)) return this

    const current = this._tokensList.get(token.network.name) ?? []
    this._tokensList.set(token.network.name, [
      ...current,
      token
    ])

    this.eventBus.emitEvent("onTokenAdded", token)
    this.sdk.withExtension(PriceStorageExtension, async priceStorage => {
      await priceStorage.forceRefetch()
    })

    return this
  }

  public remove(token: BasicToken) {
    if (!this.exist(token)) return this

    const current = this._tokensList.get(token.network.name) ?? []
    this._tokensList.set(token.network.name, current.filter(a => !a.address.equalTo(token.address)))

    this.eventBus.emitEvent("onTokenRemoved", token)

    return this
  }

  public get tokensList() {
    return Array.from(this._tokensList.values()).flat()
  }

  public list(network: Network) {
    return this._tokensList.get(network.name) ?? []
  }

  public get networks() {
    return ArrayUtils.nonNullable(
      Array.from(this._tokensList.keys()).map(networkName => (
        Array.from(networksList).find(n => n.name === networkName)
      ))
    )
  }
}