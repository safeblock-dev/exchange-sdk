import { Address, arrayUtils, evmNetworksList, networksList } from "@safeblock/blockchain-utils"
import { Network } from "ethers"
import { contractAddresses } from "~/config"
import SafeBlock from "~/sdk"
import PriceStorageExtension from "./price-storage-extension"
import SdkExtension, { PartialEventBus } from "~/sdk/sdk-extension"
import { BasicToken } from "~/types"

const events = {
  /** Fired after a token is added to the list */
  onTokenAdded: (token: BasicToken) => null,

  /** Fired after a token is removed from the list */
  onTokenRemoved: (token: BasicToken) => null
}

type TInconsistentList = Record<string, BasicToken[]> | Map<string, BasicToken[]> | [string, BasicToken[]][]

/**
 * SDK extension that stores and manages token lists.
 */
export default class TokensListExtension extends SdkExtension {
  static override name = "TokensListExtension"

  public readonly events = events

  private readonly _tokensList: Map<string, BasicToken[]> = new Map()

  public onInitialize(): void {
    this.sdk.withExtension(PriceStorageExtension, () => this._tokensList.entries().forEach(([networkName, list]) => {
      const network = Array.from(evmNetworksList).find(n => n.name === networkName)
      if (!network) return

      const usdcTokenParams = contractAddresses.usdcParams(network)
      if (list.some(t => t.address.equalTo(usdcTokenParams.address))) return

      this._tokensList.set(networkName, [
        ...list,
        {
          decimals: usdcTokenParams.decimals,
          address: Address.from(usdcTokenParams.address),
          network
        }
      ])
    }))
  }


  /**
   * SDK extension that stores and manages token lists.
   *
   * @param {SafeBlock}                        sdk       SDK instance
   * @param {PartialEventBus<typeof events>}   eventBus  partial event bus
   * @param {Record<string, BasicToken[]> |
   *        Map<string, BasicToken[]> |
   *        [string, BasicToken[]][]}          tokensList initial token list
   */
  constructor(
    private readonly sdk: SafeBlock,
    private readonly eventBus: PartialEventBus<typeof events>,
    tokensList?: Record<string, BasicToken[]> | Map<string, BasicToken[]> | [string, BasicToken[]][]
  ) {
    super()

    this._tokensList = TokensListExtension.toConsistent(tokensList ?? {})
  }

  private static toConsistent(list: TInconsistentList) {
    if (list instanceof Map) return list

    return new Map(!Array.isArray(list) ? Object.entries(list) : list)
  }


  /**
   * Check whether a token is present in the list.
   *
   * @param {BasicToken} token token to look for
   * @returns {boolean} `true` if the token exists
   */
  public exist(token: BasicToken): boolean {
    const networkTokens = this._tokensList.get(token.network.name)

    if (!networkTokens) return false

    return Address.inArray(token.address, networkTokens.map(token => token.address))
  }

  /**
   * Retrieve a token from the list.
   *
   * @param {Network} network network of the token
   * @param {Address} address token address
   * @returns the `BasicToken` if found, otherwise `null`
   */
  public get(network: Network, address: Address): BasicToken | null {
    return this._tokensList.get(network.name)?.find(t => t.address.equalTo(address)) ?? null
  }

  /**
   * Add a token to the list.
   *
   * @param {BasicToken} token token to add
   */
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

  /**
   * Remove a token from the list.
   *
   * @param {BasicToken} token token to remove
   */
  public remove(token: BasicToken) {
    if (!this.exist(token)) return this

    const current = this._tokensList.get(token.network.name) ?? []
    this._tokensList.set(token.network.name, current.filter(a => !a.address.equalTo(token.address)))

    this.eventBus.emitEvent("onTokenRemoved", token)

    return this
  }

  /**
   * Get a flat array of all registered tokens.
   *
   * @returns {BasicToken[]} list of all tokens
   */
  public get tokensList(): BasicToken[] {
    return Array.from(this._tokensList.values()).flat()
  }

  /**
   * List tokens of specific network
   *
   * @param {Network} network network
   * @returns {BasicToken[]}
   */
  public list(network: Network): BasicToken[] {
    return this._tokensList.get(network.name) ?? []
  }

  /**
   * Get a list of networks represented by the registered tokens.
   *
   * @returns {Network[]} array of networks
   */
  public get networks(): Network[] {
    return arrayUtils.nonNullable(
      Array.from(this._tokensList.keys()).map(networkName => (
        Array.from(networksList).find(n => n.name === networkName)
      ))
    )
  }
}
